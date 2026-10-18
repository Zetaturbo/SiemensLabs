"""Runs the whole workflow with different model combinations and compares them end to end.

    cd research
    .venv/bin/python scripts/bench_pipeline.py --repeats 2                      # simulated companies, no Tavily credits
    .venv/bin/python scripts/bench_pipeline.py --live "Knorr-Bremse" --country DE --website knorr-bremse.com --configs fast --repeats 2

Ground truth for the simulated companies is known (sandbox/*): Fennic has 6 documents with serious findings, Pradova has 4 clean
ones. Measured per run: wall time and time per stage, share of source documents cited by verified claims (coverage), flags,
overall assessment, claims the verifier could not check, and how often a model other than the first in the chain answered.
"""

import argparse
import json
import os
import statistics
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from research_service.config import load_settings  # noqa: E402
from research_service.context import AppContext, Sandbox  # noqa: E402
from research_service.llm import FallbackChain, LLMClient  # noqa: E402
from research_service.sources import load_lanes  # noqa: E402
from research_service.store import JobStore  # noqa: E402
from research_service.tools import get_research_report, research_company  # noqa: E402
from research_service import context  # noqa: E402

NB, NV = "nebius", "nvidia"
SUPER = (NV, "nvidia/nemotron-3-super-120b-a12b")
PRO, FLASH, K3 = (NB, "deepseek-ai/DeepSeek-V4-Pro"), (NB, "deepseek-ai/DeepSeek-V4.1-Flash"), (NB, "moonshotai/Kimi-K3")
OSS, MINIMAX = (NB, "openai/gpt-oss-120b"), (NB, "MiniMaxAI/MiniMax-M3")

CONFIGS = {
    "current": {"planner_writer": [PRO, K3, SUPER], "lane_agent": [FLASH, K3, PRO, SUPER], "verifier": [K3, OSS, MINIMAX, SUPER]},
    "fast": {"planner_writer": [PRO, K3, SUPER], "lane_agent": [PRO, FLASH, SUPER], "verifier": [OSS, MINIMAX, K3, SUPER]},
    "flash-lane": {"planner_writer": [PRO, K3, SUPER], "lane_agent": [FLASH, PRO, SUPER], "verifier": [OSS, MINIMAX, K3, SUPER]},
    "pro-k3": {"planner_writer": [PRO, K3, SUPER], "lane_agent": [PRO, FLASH, SUPER], "verifier": [K3, OSS, SUPER]},
}
CORPUS = {"Fennic Railway Brakes GmbH": 6, "Pradova Friction GmbH": 4}  # documents in sandbox/


def load_env() -> None:
    path = ROOT / ".env"
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.strip() and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip())


class Counting:
    """Wraps a chain and counts which route answered."""

    def __init__(self, chain: FallbackChain):
        self.chain, self.answers = chain, {}

    def chat(self, messages, **kw):
        label, msg = self.chain.chat(messages, **kw)
        self.answers[label] = self.answers.get(label, 0) + 1
        return label, msg


def build_chains(config: dict) -> dict:
    providers = json.loads((ROOT / "config" / "models.json").read_text(encoding="utf-8"))["providers"]
    clients = {}
    for name, p in providers.items():
        key = os.environ.get(p["key_env"])
        if key:
            base = p.get("base_url") or os.environ.get(p.get("base_url_env", ""), p.get("base_url_default", ""))
            clients[name] = LLMClient(base, key)
    return {role: Counting(FallbackChain([(f"{p}:{m}", clients[p], m) for p, m in routes if p in clients])) for role, routes in config.items()}


def stage_times(job: dict) -> dict:
    from datetime import datetime

    ts = lambda s: datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").timestamp()  # noqa: E731
    start = ts(job["created_at"])
    first = {}
    for p in job["progress"]:
        first.setdefault(p["step"], ts(p["ts"]) - start)
    end = ts(job["updated_at"]) - start
    return {"plan_done": first.get("plan", 0), "lanes_done": first.get("verify", end) - first.get("plan", 0), "verify_done": first.get("report", end) - first.get("verify", end),
            "report_done": end - first.get("report", end)}


def run_once(config_name: str, config: dict, company: str, live: dict | None) -> dict:
    chains = build_chains(config)
    settings = load_settings()
    ctx = AppContext(settings=settings, store=JobStore(None), executor=ThreadPoolExecutor(1), sandbox=Sandbox(), lanes=load_lanes(), chain_factory=lambda role: chains[role])
    context.set_context(ctx)  # tools read the current context; runs are started one at a time per call below
    t0 = time.time()
    job_id = research_company({"company_name": company, **(live or {})})["data"]["job_id"]
    while ctx.store.get(job_id)["status"] not in ("done", "failed"):
        time.sleep(0.5)
    job = ctx.store.get(job_id)
    out = {"config": config_name, "company": company, "status": job["status"], "seconds": round(time.time() - t0, 1), "error": job["error"]}
    if job["status"] == "done":
        report = job["report"]
        verified_urls = {c["source_url"] for c in report["claims"] if c["status"] == "verified"}
        unchecked = "could not be checked" in report["limitations"]
        out.update(stages={k: round(v, 1) for k, v in stage_times(job).items()}, claims=report["verification_summary"], flags=len(report["risk_flags"]), overall=report["overall_assessment"],
                   coverage=round(len(verified_urls) / CORPUS[company], 2) if company in CORPUS else None, unchecked=unchecked,
                   fallbacks=sum(n for c in chains.values() for label, n in c.answers.items() if label != c.chain.routes[0][0]), model_calls=sum(sum(c.answers.values()) for c in chains.values()))
    ctx.executor.shutdown(wait=False)
    return out


def main() -> int:
    load_env()
    ap = argparse.ArgumentParser()
    ap.add_argument("--configs", default=",".join(CONFIGS))
    ap.add_argument("--repeats", type=int, default=2)
    ap.add_argument("--live")
    ap.add_argument("--country")
    ap.add_argument("--website")
    args = ap.parse_args()
    companies = [args.live] if args.live else list(CORPUS)
    live = {"country": args.country, "website": args.website} if args.live else None
    rows = []
    for name in args.configs.split(","):
        jobs = [(name, c) for c in companies for _ in range(args.repeats)]
        # one run at a time per context (the tools use one global context), companies and repeats in sequence
        for config_name, company in jobs:
            r = run_once(config_name, CONFIGS[config_name], company, live)
            rows.append(r)
            print(f"  {config_name:11} {company[:26]:26} {r['status']:6} {r['seconds']:6.1f}s  stages={r.get('stages')}  verified={r.get('claims', {}).get('verified')} flags={r.get('flags')} "
                  f"overall={r.get('overall')} coverage={r.get('coverage')} unchecked={r.get('unchecked')} fallbacks={r.get('fallbacks')}/{r.get('model_calls')}  {r['error'] or ''}", flush=True)
    print("\nMedians per configuration and company")
    for name in args.configs.split(","):
        for company in companies:
            ok = [r for r in rows if r["config"] == name and r["company"] == company and r["status"] == "done"]
            n = sum(1 for r in rows if r["config"] == name and r["company"] == company)
            if not ok:
                print(f"  {name:11} {company[:26]:26} 0/{n} finished")
                continue
            med = lambda k: round(statistics.median(r[k] if k != "verified" else r["claims"]["verified"] for r in ok), 2)  # noqa: E731
            cov = [r["coverage"] for r in ok if r["coverage"] is not None]
            print(f"  {name:11} {company[:26]:26} {len(ok)}/{n} finished  median {med('seconds')} s  verified {med('verified')}  flags {med('flags')}  "
                  f"coverage {round(statistics.median(cov), 2) if cov else '-'}  overall {sorted({r['overall'] for r in ok})}  fallbacks {sum(r['fallbacks'] for r in ok)}")
    out = ROOT / "eval" / "bench_pipeline.json"
    on_disk = json.loads(out.read_text(encoding="utf-8")) if out.exists() else []
    out.write_text(json.dumps(on_disk + rows, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
