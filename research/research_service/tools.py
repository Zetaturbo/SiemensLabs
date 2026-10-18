"""The research tools the frontend calls (POST /tools/<tool>, docs/SPEC.md section 7). Each takes the input object, returns an envelope."""

from typing import Callable

from .context import get_context
from .entity import core_name
from .envelope import ToolError, ok
from .guards import reject_synthetic
from .pipeline import run_job


def _job(inp: dict) -> dict:
    job_id = str(inp.get("job_id", ""))
    job = get_context().store.get(job_id)
    if not job:
        raise ToolError("UNKNOWN_JOB", f"{job_id or 'no job_id'} does not exist")
    return job


def _status(job: dict) -> dict:
    out = {"job_id": job["job_id"], "status": job["status"], "progress": job["progress"], "supplier_id": job.get("supplier_id"),
           "simulated": bool(job.get("simulated"))}
    if job["candidates"]:
        out["candidates"] = job["candidates"]
    if job["error"]:
        out["error"] = job["error"]
    return out


def research_company(inp: dict) -> dict:
    ctx = get_context()
    name = reject_synthetic(inp.get("company_name"))
    country = str(inp["country"]).strip().upper() if inp.get("country") else None
    # A double click or a repeated chat message must not start a second run (and spend a second budget) for the same company.
    running = ctx.store.find_active(lambda j: core_name(j["company_name"]) == core_name(name) and (j.get("country") or None) == country)
    if running:
        return ok({"job_id": running["job_id"], "status": running["status"]}, reused=True)
    sandbox = ctx.sandbox.find(name)
    job = ctx.store.create(company_name=name, country=country, website=inp.get("website") or None, supplier_id=inp.get("supplier_id") or None,
                           simulated=bool(sandbox))
    ctx.executor.submit(run_job, ctx, job["job_id"])
    return ok({"job_id": job["job_id"], "status": "queued"})


def get_research_status(inp: dict) -> dict:
    return ok(_status(_job(inp)))


def confirm_entity(inp: dict) -> dict:
    ctx = get_context()
    job = _job(inp)
    if job["status"] != "needs_disambiguation":
        raise ToolError("INVALID_INPUT", f"the job is {job['status']}, not waiting for a choice")
    chosen = next((c for c in job["candidates"] or [] if c["candidate_id"] == inp.get("candidate_id")), None)
    if not chosen:
        raise ToolError("INVALID_INPUT", "candidate_id is not one of the candidates")
    entity = {k: chosen.get(k) for k in ("legal_name", "country", "website", "lei")} | {"website": job.get("website")}
    ctx.store.update(job["job_id"], entity=entity, status="queued", candidates=None)
    ctx.store.add_event(job["job_id"], "entity", f"Buyer chose {chosen['legal_name']} ({chosen.get('country')})", "planner")
    ctx.executor.submit(run_job, ctx, job["job_id"])
    return ok(_status(ctx.store.get(job["job_id"])))


def get_research_report(inp: dict) -> dict:
    job = _job(inp)
    if job["status"] == "failed":
        raise ToolError("INTERNAL", job["error"] or "the run failed")
    if job["status"] != "done":
        raise ToolError("NOT_READY", f"the job is {job['status']}")
    return ok(job["report"])


def get_research_claims(inp: dict) -> dict:
    job = _job(inp)
    return ok({"job_id": job["job_id"], "claims": job["claims"]})


def list_research_jobs(inp: dict) -> dict:
    jobs = get_context().store.list(int(inp.get("limit", 50)))
    return ok({"jobs": [{"job_id": j["job_id"], "company_name": j["company_name"], "status": j["status"], "supplier_id": j.get("supplier_id"),
                         "simulated": bool(j.get("simulated")), "created_at": j["created_at"]} for j in jobs]})


TOOLS: dict[str, Callable[[dict], dict]] = {
    "research_company": research_company,
    "get_research_status": get_research_status,
    "confirm_entity": confirm_entity,
    "get_research_report": get_research_report,
    "get_research_claims": get_research_claims,
    "list_research_jobs": list_research_jobs,
}

PLANNED_TOOLS: list[str] = []
