"""Scripted stand-ins for the model chain and the web, so the whole workflow runs in tests without keys."""

import json
import re
import time
from concurrent.futures import ThreadPoolExecutor

from research_service.config import load_settings
from research_service.context import AppContext, Sandbox
from research_service.llm import LLMError
from research_service.sources import SandboxAdapter, load_lanes
from research_service.store import JobStore

CATEGORY = {"news": "operations", "company": "esg", "legal": "legal", "science": "safety"}
SIMULATED = "SIMULATED DOCUMENT. All names, events and figures are invented for the demo. "


def tool_call(name: str, args: dict, n: int = 1) -> dict:
    return {"content": None, "tool_calls": [{"id": f"call_{n}", "type": "function", "function": {"name": name, "arguments": json.dumps(args)}}]}


class ScriptedChain:
    """Answers each kind of prompt the pipeline sends. Options change what the 'model' does."""

    def __init__(self, severity: dict | None = None, fabricate: bool = False, verify_label: str = "verified", fail: str | None = None, same_fact: bool = True):
        self.severity = severity or {"news": "moderate", "company": "low", "legal": "high", "science": "moderate"}
        self.fabricate, self.verify_label, self.fail, self.same_fact = fabricate, verify_label, fail, same_fact
        self.calls: list[str] = []

    def chat(self, messages, validate=None, **extra):
        first = messages[0]["content"]
        if "research planner" in first:
            kind = "planner"
        elif "research agent in a supplier risk review" in first:
            kind = "agent"
        elif "strict fact checker" in first:
            kind = "verifier"
        elif "state the same fact" in first:
            kind = "corroborate"
        else:
            kind = "writer"
        self.calls.append(kind)
        if self.fail == kind:
            raise LLMError("scripted failure")
        return "fake:model", getattr(self, f"_{kind}")(messages, extra)

    def _planner(self, messages, extra):
        return {"content": json.dumps({"plan": [{"lane": lane, "question": f"What about {lane}?"} for lane in ("news", "company", "legal", "science")]})}

    def _agent(self, messages, extra):
        lane = re.search(r"the (\w+) research agent", messages[0]["content"]).group(1)
        rounds = sum(1 for m in messages if m["role"] == "assistant")
        tools = [m for m in messages if m["role"] == "tool"]
        if "tools" in extra and rounds == 0:
            return tool_call("search", {"query": f"{lane} risk"})
        if "tools" in extra and rounds == 1:
            hits = json.loads(tools[-1]["content"])
            return tool_call("fetch", {"url": hits[0]["url"]}, 2) if hits else {"content": json.dumps({"claims": []})}
        if len(tools) < 2:
            return {"content": json.dumps({"claims": []})}
        page = json.loads(tools[1]["content"])
        quote = page["text"].split(SIMULATED)[-1][:110].rsplit(" ", 1)[0]
        claims = [{"statement": f"Finding for the {lane} lane: {quote[:50]}", "category": CATEGORY[lane], "severity": self.severity[lane], "quote": quote, "source_url": page["url"]}]
        if self.fabricate:
            claims.append({"statement": "Invented claim", "category": "legal", "severity": "high", "quote": "This sentence is not in any page.", "source_url": page["url"]})
        return {"content": json.dumps({"claims": claims})}

    def _verifier(self, messages, extra):
        n = len(re.findall(r"ITEM \d+", messages[0]["content"]))
        return {"content": json.dumps({"results": [{"id": i, "label": self.verify_label} for i in range(1, n + 1)]})}

    def _corroborate(self, messages, extra):
        matches = [{"claim_id": m.group(1), "same_fact_as": [x.strip() for x in m.group(2).split(",")] if self.same_fact else []}
                   for m in re.finditer(r"(c_\d+) may only be matched with: ([^\n]*)", messages[0]["content"])]
        return {"content": json.dumps({"matches": matches})}

    def _writer(self, messages, extra):
        claims = re.findall(r"^(c_\d+) \[[^\]]*\]: (.*)$", messages[0]["content"], re.M)
        return {"content": json.dumps({"summary": "Several findings were verified.", "flags": [{"claim_ids": [cid], "title": f"Title {cid}", "finding": text} for cid, text in claims]})}


class SandboxAsLive(SandboxAdapter):
    """Lets the live path run in tests: sandbox documents behind a Tavily-like interface with a lane domain list."""

    def allowed_domains(self, lane):
        return ["sim.example"]


def make_context(tmp_path=None, chain=None, live_folder=None, workers: int = 2) -> AppContext:
    settings = load_settings()
    chain = chain or ScriptedChain()
    ctx = AppContext(settings=settings, store=JobStore(tmp_path), executor=ThreadPoolExecutor(workers), sandbox=Sandbox(), lanes=load_lanes(),
                     chain_factory=lambda role: chain, live_adapter_factory=(lambda extra: SandboxAsLive(live_folder)) if live_folder else None)
    return ctx


def wait_for(ctx: AppContext, job_id: str, states=("done", "failed", "needs_disambiguation"), timeout: float = 15) -> dict:
    end = time.time() + timeout
    while time.time() < end:
        job = ctx.store.get(job_id)
        if job["status"] in states:
            return job
        time.sleep(0.02)
    raise AssertionError(f"job still {ctx.store.get(job_id)['status']} after {timeout}s")
