"""Builds the fixed evidence set used to compare models: real pages from the locked sources, one set per lane and company.

    cd research && .venv/bin/python scripts/build_evidence.py

Uses the same TavilyAdapter as the service, so the closed lane lists are enforced. For each lane and company it keeps up
to two pages that really mention the company. Pages are cut to a window around the first mention so that every model sees
the same text. Output: eval/evidence/<lane>__<company>.json (committed, so runs are repeatable and cost no credits).
"""

import argparse
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from research_service.sources import SourceNotAllowed, TavilyAdapter, host_matches  # noqa: E402

OUT = ROOT / "eval" / "evidence"
WINDOW = 3500
LONG_WINDOW = 12000
PAGES_PER_SET = 2


def load_env() -> None:
    path = ROOT / ".env"
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.strip() and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip())


LANES = json.loads((ROOT / "config" / "sources.json").read_text(encoding="utf-8"))["lanes"]


def tier(url: str, lane: str) -> int:
    """Trust tier of the matching domain in sources.json (1 best). The company's own website counts as tier 1."""
    details = LANES[lane].get("details", {})
    best = [d["tier"] for dom, d in details.items() if host_matches(url, dom)]
    return min(best) if best else 1


def window(text: str, token: str, size: int) -> str:
    i = text.lower().find(token)
    start = text.rfind("\n", 0, max(0, i - 300)) + 1
    return text[start:start + size]


def main() -> int:
    load_env()
    ap = argparse.ArgumentParser()
    ap.add_argument("--lane")
    args = ap.parse_args()
    key = os.environ.get("TAVILY_API_KEY")
    if not key:
        print("TAVILY_API_KEY is not set")
        return 1
    cand = json.loads((ROOT / "config" / "source_candidates.json").read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    for lane, cfg in cand["lanes"].items():
        if args.lane and lane != args.lane:
            continue
        for company in cand["companies"]:
            # The company lane also gets the company's own website, the same way the service adds the resolved website.
            adapter = TavilyAdapter(key, extra_domains={"company": [company["website"]]})
            hits = adapter.search(cfg["query"].format(company=company["name"]), lane, max_results=10)
            hits.sort(key=lambda h: (company["token"] not in (h.title + " " + h.snippet).lower(), tier(h.url, lane)))
            pages, seen = [], set()
            for hit in hits:
                if len(pages) >= PAGES_PER_SET:
                    break
                same = re.sub(r"^https?://(www\.)?", "", hit.url).rstrip("/")  # http and https copies of one page
                if same in seen:
                    continue
                seen.add(same)
                try:
                    page = adapter.fetch(hit.url, lane)
                except SourceNotAllowed as e:
                    print(f"  skip {hit.url}: {e}")
                    continue
                if company["token"] not in page.text.lower():
                    continue
                pages.append({"url": hit.url, "title": hit.title, "published": hit.published,
                              "text": window(page.text, company["token"], WINDOW),
                              "text_long": window(page.text, company["token"], LONG_WINDOW)})
            name = f"{lane}__{company['name'].lower()}"
            (OUT / f"{name}.json").write_text(json.dumps({"lane": lane, "company": company["name"], "pages": pages}, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            print(f"{name}: {len(pages)} pages " + ", ".join(p["url"][:70] for p in pages))
    return 0


if __name__ == "__main__":
    sys.exit(main())
