"""Runs one research job in this process and prints the progress and the report. Uses the real models and, for real
companies, the real web (Tavily credits). Fictional demo companies (sandbox/registry.json) use no credits.

    cd research
    .venv/bin/python scripts/run_research.py "Fennic Railway Brakes GmbH"
    .venv/bin/python scripts/run_research.py "Knorr-Bremse" --country DE --website knorr-bremse.com --save ../mocks/research_report_knorr_bremse.json
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from research_service import context  # noqa: E402
from research_service.tools import confirm_entity, get_research_report, get_research_status, research_company  # noqa: E402


def load_env() -> None:
    path = ROOT / ".env"
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.strip() and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip())


def main() -> int:
    load_env()
    ap = argparse.ArgumentParser()
    ap.add_argument("company")
    ap.add_argument("--country")
    ap.add_argument("--website")
    ap.add_argument("--pick", type=int, default=1, help="candidate number to confirm if the company is ambiguous")
    ap.add_argument("--save", help="write the report JSON here")
    args = ap.parse_args()

    started = time.time()
    job_id = research_company({"company_name": args.company, "country": args.country, "website": args.website})["data"]["job_id"]
    seen = 0
    while True:
        status = get_research_status({"job_id": job_id})["data"]
        for p in status["progress"][seen:]:
            print(f"  +{time.time() - started:5.1f}s  {p['step']:8} {p.get('agent') or '':9} {p['message']}")
        seen = len(status["progress"])
        if status["status"] == "needs_disambiguation":
            print("  candidates:", [(c["legal_name"], c["country"]) for c in status["candidates"]])
            confirm_entity({"job_id": job_id, "candidate_id": status["candidates"][args.pick - 1]["candidate_id"]})
        elif status["status"] in ("done", "failed"):
            break
        time.sleep(1)
    print(f"\nstatus: {status['status']} after {time.time() - started:.0f} s", status.get("error") or "")
    if status["status"] != "done":
        return 1
    report = get_research_report({"job_id": job_id})["data"]
    print(f"overall: {report['overall_assessment']}   {report['verification_summary']}")
    print("summary:", report["summary"])
    for f in report["risk_flags"]:
        print(f"  [{f['severity']:8}] {f['category']:9} {f['title']}  ({f['date']}, {len(f['sources'])} source(s))")
    print("limitations:", report["limitations"])
    if args.save:
        Path(args.save).write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print("saved", args.save)
    return 0


if __name__ == "__main__":
    sys.exit(main())
