"""Probes candidate source domains with real companies, through Tavily.

    cd research && .venv/bin/python scripts/probe_sources.py            # about 300 credits for the full pool
    .venv/bin/python scripts/probe_sources.py --lane legal              # one lane

For every domain and company it searches the domain with the lane's query, checks whether the hits mention the company,
then extracts the best hit (basic, then advanced) and checks that the page text exists and mentions the company.
Results go to config/source_probe_results.json. TAVILY_API_KEY is read from the environment or research/.env.
"""

import argparse
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config"
OUT = CONFIG / "source_probe_results.json"
BASE = "https://api.tavily.com"


def load_env() -> None:
    path = ROOT / ".env"
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.strip() and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip())


def post(path: str, body: dict, key: str, tries: int = 3) -> dict:
    for attempt in range(tries):
        try:
            r = httpx.post(f"{BASE}/{path}", json=body, headers={"Authorization": f"Bearer {key}"}, timeout=90)
            if r.status_code == 429:
                time.sleep(3 * (attempt + 1))
                continue
            return r.json() if r.status_code == 200 else {"error": f"HTTP {r.status_code}"}
        except Exception as e:
            err = type(e).__name__
    return {"error": err if "err" in dir() else "rate limited"}


def probe(domain: str, lane_cfg: dict, companies: list[dict], key: str) -> dict:
    row = {"companies": {}, "extract": "none", "chars": 0}
    best = None
    for c in companies:
        data = post("search", {"query": lane_cfg["query"].format(company=c["name"]), "include_domains": [domain],
                               "max_results": 5, "search_depth": "basic", "include_published_date": True}, key)
        hits = data.get("results", [])
        relevant = [h for h in hits if c["token"] in (h["title"] + " " + h.get("content", "")).lower()]
        row["companies"][c["name"]] = {"hits": len(hits), "relevant": len(relevant), "error": data.get("error")}
        if relevant and best is None:
            best = (relevant[0]["url"], c["token"])
        elif hits and best is None:
            best = (hits[0]["url"], None)
    if best:
        url, token = best
        for depth in ("basic", "advanced"):
            ex = post("extract", {"urls": [url], "extract_depth": depth, "format": "markdown"}, key)
            got = ex.get("results") or []
            if got:
                text = got[0]["raw_content"]
                row.update(extract=depth, chars=len(text), sample_url=url, page_mentions_company=bool(token and token in text.lower()))
                break
    return row


def main() -> int:
    load_env()
    ap = argparse.ArgumentParser()
    ap.add_argument("--lane")
    args = ap.parse_args()
    key = os.environ.get("TAVILY_API_KEY")
    if not key:
        print("TAVILY_API_KEY is not set (put it in research/.env)")
        return 1
    cand = json.loads((CONFIG / "source_candidates.json").read_text(encoding="utf-8"))
    results = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    for lane, cfg in cand["lanes"].items():
        if args.lane and lane != args.lane:
            continue
        print(f"\n{lane}")
        with ThreadPoolExecutor(5) as pool:
            rows = list(pool.map(lambda d: probe(d, cfg, cand["companies"], key), cfg["domains"]))
        results[lane] = dict(zip(cfg["domains"], rows))
        for d, r in results[lane].items():
            rel = sum(1 for v in r["companies"].values() if v["relevant"])
            print(f"  extract={r['extract']:8} chars={r['chars']:8} relevant_for={rel}/{len(cand['companies'])}  {d}")
    OUT.write_text(json.dumps(results, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"\nWrote {OUT.relative_to(ROOT.parent)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
