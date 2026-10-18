"""The research run: resolve the company, plan, run the four lane agents in parallel, verify, write the report.

Runs inside the worker pool. Every stage writes progress events the frontend shows live. A run has a hard time limit and a
cap on Tavily calls, and it degrades instead of stopping: a failed lane is noted in the report limitations.
"""

import threading
import time
from concurrent.futures import ThreadPoolExecutor

from . import entity as entity_registry
from .agents import host_of, run_lane_agent
from .context import AppContext, website_domain
from .planner import make_plan
from .sources import SourceNotAllowed
from .verifier import corroborate, verify_claims
from .writer import build_report

LANE_ORDER = ["news", "company", "legal", "science"]
RESERVE_SECONDS = 45  # kept for verification and the report when the lanes run long


class BudgetExceeded(SourceNotAllowed):
    pass


class BudgetedAdapter:
    """Counts Tavily calls and refuses more than the run's budget."""

    def __init__(self, adapter, max_calls: int):
        self.adapter, self.max_calls, self.calls, self._lock = adapter, max_calls, 0, threading.Lock()

    def _spend(self) -> None:
        with self._lock:
            if self.calls >= self.max_calls:
                raise BudgetExceeded("the search budget for this run is used up")
            self.calls += 1

    def search(self, *args, **kwargs):
        self._spend()
        return self.adapter.search(*args, **kwargs)

    def fetch(self, *args, **kwargs):
        self._spend()
        return self.adapter.fetch(*args, **kwargs)

    def allowed_domains(self, lane: str) -> list[str]:
        return self.adapter.allowed_domains(lane) if hasattr(self.adapter, "allowed_domains") else ["the simulated documents"]


def resolve_company(ctx: AppContext, job: dict, emit) -> dict | None:
    """Returns the entity, or None when the buyer must choose (the job is then set to needs_disambiguation)."""
    entry = ctx.sandbox.find(job["company_name"])
    if entry:
        emit("entity", f"{entry['name']} is a simulated demo company", "planner")
        return {"legal_name": entry["name"], "country": entry["country"], "website": None, "lei": None, "simulated": True, "sandbox_folder": entry["folder"]}
    emit("entity", f"Looking up {job['company_name']} in the company registry (GLEIF)", "planner")
    try:
        found = entity_registry.resolve(job["company_name"], job.get("country"), ctx.http)
    except Exception:
        emit("entity", "The company registry is unavailable, using the name as typed", "planner")
        found = {}
    if "entity" in found:
        e = found["entity"]
        emit("entity", f"Matched {e['legal_name']} ({e['country']})", "planner")
        return {k: e.get(k) for k in ("legal_name", "country", "website", "lei")} | {"website": job.get("website")}
    if "candidates" in found:
        ctx.store.update(job["job_id"], status="needs_disambiguation", candidates=found["candidates"])
        emit("entity", "Several companies match, waiting for the buyer to choose", "planner")
        return None
    emit("entity", "No registry match, researching the name as typed", "planner")
    return {"legal_name": job["company_name"], "country": job.get("country"), "website": job.get("website"), "lei": None}


def run_job(ctx: AppContext, job_id: str) -> None:
    """Entry point for the worker pool. Never raises: any failure ends the job as failed with a readable message."""
    store = ctx.store

    def emit(step: str, message: str, agent: str | None = None) -> None:
        store.add_event(job_id, step, message, agent)

    try:
        job = store.get(job_id)
        store.update(job_id, status="running")
        entity = job["entity"] or resolve_company(ctx, job, emit)
        if entity is None:
            return
        store.update(job_id, entity=entity, simulated=bool(entity.get("simulated")), status="running", candidates=None)
        run_pipeline(ctx, store.get(job_id), entity, emit)
    except Exception as e:
        store.update(job_id, status="failed", error=f"{type(e).__name__}: {str(e)[:300]}")
        store.add_event(job_id, "report", "The run failed", None)


def run_pipeline(ctx: AppContext, job: dict, entity: dict, emit) -> None:
    s = ctx.settings
    started = time.time()
    deadline = started + s.max_run_seconds
    if entity.get("simulated"):
        adapter = BudgetedAdapter(ctx.sandbox.adapter({"folder": entity["sandbox_folder"]}), 10_000)
    else:
        extra = website_domain(entity.get("website"))
        adapter = BudgetedAdapter(ctx.live_adapter({"company": [extra]} if extra else {}), s.max_tavily_calls)

    plan = make_plan(entity, {lane: ctx.lanes[lane] for lane in LANE_ORDER}, ctx.chain("planner_writer"), emit)
    lane_chain = ctx.chain("lane_agent")

    def lane(name: str):
        return run_lane_agent(name, entity, plan[name], adapter, lane_chain, description=ctx.lanes[name]["description"],
                              domains=adapter.allowed_domains(name), max_steps=s.max_lane_steps, max_claims=s.max_claims_per_lane,
                              deadline=deadline - RESERVE_SECONDS, emit=emit)

    with ThreadPoolExecutor(len(LANE_ORDER)) as pool:
        results = list(pool.map(lane, LANE_ORDER))

    claims, pages, notes, dropped = [], {}, [], 0
    for r in results:
        pages.update(r.pages)
        dropped += r.dropped
        if r.error:
            notes.append(f"The {r.lane} lane failed ({r.error}).")
        elif not r.claims:
            notes.append(f"The {r.lane} lane returned no findings.")
        for c in r.claims:
            claims.append({"claim_id": f"c_{len(claims) + 1:03d}", "run_id": job["job_id"], **c, "simulated": c["simulated"] or bool(entity.get("simulated"))})
            if c["severity"] == "high":
                emit("red_flag", f"High-severity item found via {host_of(c['source_url'])}", c["agent"])
    if all(r.error for r in results):
        raise RuntimeError("Every lane failed: " + "; ".join(r.error for r in results))
    if time.time() > deadline - RESERVE_SECONDS:
        notes.append("The run time limit was reached, so some lanes may have stopped early.")

    unchecked = verify_claims(entity, claims, pages, ctx.chain("verifier"), emit) if claims else 0
    corroborate(entity, claims, ctx.chain("verifier"), emit)
    ctx.store.update(job["job_id"], claims=claims)

    emit("report", "Writing the report from verified claims", "writer")
    report = build_report(ctx.store.get(job["job_id"]), entity, claims, notes, dropped, unchecked, ctx.chain("planner_writer"))
    ctx.store.update(job["job_id"], report=report, status="done")
    emit("report", f"Report ready in {int(time.time() - started)} s", "writer")
