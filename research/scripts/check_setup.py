"""Checks that every candidate source and model in research/config can actually be used.

    cd research
    .venv/bin/python scripts/check_setup.py --steps reach            # no keys needed
    .venv/bin/python scripts/check_setup.py --steps tavily           # needs TAVILY_API_KEY, about 70 credits
    .venv/bin/python scripts/check_setup.py --steps models           # needs LLM_API_KEY
    .venv/bin/python scripts/check_setup.py --steps models --only-model nvidia/nemotron-3-super-120b-a12b

Keys are read from the environment or research/.env and are never printed. Results are written to
research/config/check_results.json (merged per step).
"""

import argparse
import json
import os
import re
import statistics
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlparse

import httpx

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "config"
RESULTS = CONFIG / "check_results.json"
UA = "Mozilla/5.0 (compatible; research-check/0.1)"


def load_env() -> None:
    path = ROOT / ".env"
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def host_matches(url: str, domain: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    return host == domain or host.endswith("." + domain)


# ---------------------------------------------------------------- step 1: reachability (no keys)

def check_reach(sources: dict) -> dict:
    domains = sorted({d for lane in sources["lanes"].values() for d in lane["domains"]})

    def one(domain: str) -> dict:
        t0 = time.time()
        try:
            r = httpx.get(f"https://{domain}", headers={"User-Agent": UA}, follow_redirects=True, timeout=15)
            verdict = "ok" if r.status_code < 400 else ("blocked" if r.status_code in (401, 403, 429) else "error")
            return {"status": r.status_code, "verdict": verdict, "final_host": r.url.host, "seconds": round(time.time() - t0, 1)}
        except Exception as e:
            return {"status": None, "verdict": "error", "error": type(e).__name__, "seconds": round(time.time() - t0, 1)}

    with ThreadPoolExecutor(8) as pool:
        out = dict(zip(domains, pool.map(one, domains)))
    print("\nReachability (plain HTTP GET of the home page; a 403 only means bots are blocked, Tavily may still work)")
    for d, r in out.items():
        print(f"  {r['verdict']:8} {str(r['status']):5} {d}")
    return out


# ---------------------------------------------------------------- step 2: Tavily

def tavily(path: str, body: dict, key: str) -> tuple[int, dict]:
    r = httpx.post(f"https://api.tavily.com/{path}", json=body, headers={"Authorization": f"Bearer {key}"}, timeout=90)
    try:
        return r.status_code, r.json()
    except ValueError:
        return r.status_code, {"error": r.text[:200]}


def check_tavily(sources: dict, key: str) -> dict:
    out: dict = {"domains": {}, "lanes": {}}
    for lane, cfg in sources["lanes"].items():
        print(f"\nTavily lane: {lane}")
        for domain in cfg["domains"]:
            status, data = tavily("search", {"query": cfg["probe_query"], "include_domains": [domain], "max_results": 3, "search_depth": "basic"}, key)
            urls = [x["url"] for x in data.get("results", [])]
            row = {"lane": lane, "search_status": status, "results": len(urls), "off_list": [u for u in urls if not host_matches(u, domain)]}
            if urls:
                ex_status, ex = tavily("extract", {"urls": [urls[0]], "extract_depth": "basic"}, key)
                got = ex.get("results", [])
                row["extract_ok"] = bool(got)
                row["extract_chars"] = len(got[0]["raw_content"]) if got else 0
                row["sample_url"] = urls[0]
            verdict = "ok" if row["results"] and row.get("extract_ok") else ("no_results" if not row["results"] else "no_extract")
            row["verdict"] = "error" if status != 200 else verdict
            out["domains"][domain] = row
            print(f"  {row['verdict']:10} {domain:55} results={row['results']} chars={row.get('extract_chars', '-')}")
        # Whole lane in one call: tests the multi-domain filter and that nothing leaves the list.
        status, data = tavily("search", {"query": cfg["probe_query"], "include_domains": cfg["domains"], "max_results": 10, "search_depth": "basic"}, key)
        urls = [x["url"] for x in data.get("results", [])]
        off = [u for u in urls if not any(host_matches(u, d) for d in cfg["domains"])]
        out["lanes"][lane] = {"search_status": status, "results": len(urls), "hosts": sorted({urlparse(u).hostname for u in urls}), "off_list": off}
        print(f"  lane search: status={status} results={len(urls)} hosts={len(out['lanes'][lane]['hosts'])} off_list={len(off)}")
    return out


# ---------------------------------------------------------------- step 3: models

PASSAGE = (
    "Example Rail Components GmbH announced on 14 March 2025 a voluntary recall of 1,200 brake valve batches "
    "after a supplier found a seal defect. No injuries were reported. The company said the cost would be below "
    "EUR 5 million."
)

VERIFY_CASES = [
    ("Example Rail Components recalled brake valve batches in March 2025.", "announced on 14 March 2025 a voluntary recall of 1,200 brake valve batches", "verified"),
    ("The recall affected 1,200 batches and cost more than EUR 5 million.", "a voluntary recall of 1,200 brake valve batches", "partial"),
    ("The recall caused several injuries.", "No injuries were reported.", "contradicted"),
    ("The company was fined by regulators over the recall.", "The company said the cost would be below EUR 5 million.", "unsupported"),
    ("No injuries were reported in connection with the recall.", "No injuries were reported.", "verified"),
    ("The recall was ordered by the regulator.", "a voluntary recall of 1,200 brake valve batches", "contradicted"),
    ("The estimated cost was under EUR 5 million.", "the cost would be below EUR 5 million", "verified"),
    ("Example Rail Components is insolvent.", "announced on 14 March 2025 a voluntary recall", "unsupported"),
]

WRITER_CLAIMS = [
    ("c_001", "The company recalled 1,200 brake valve batches in March 2025."),
    ("c_002", "The recall followed a seal defect found by a supplier."),
    ("c_003", "No injuries were reported."),
]


def chat(base: str, key: str, model: str, messages: list, **extra) -> dict:
    body = {"model": model, "messages": messages, "temperature": 0, "max_tokens": 900, **extra}
    r = httpx.post(f"{base}/chat/completions", json=body, headers={"Authorization": f"Bearer {key}"}, timeout=120)
    if r.status_code != 200:
        raise RuntimeError(f"HTTP {r.status_code}: {r.text[:160]}")
    return r.json()["choices"][0]["message"]


def parse_json(text: str):
    text = re.sub(r"<think>.*?</think>", "", text or "", flags=re.S).strip()
    fenced = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    if fenced:
        text = fenced.group(1)
    starts = [i for i in (text.find("{"), text.find("[")) if i >= 0]
    if not starts:
        raise ValueError("no JSON in reply")
    obj, _ = json.JSONDecoder().raw_decode(text[min(starts):])
    return obj


def timed(fn):
    t0 = time.time()
    try:
        res = fn()
    except Exception as e:
        res = {"pass": False, "detail": f"{type(e).__name__}: {str(e)[:140]}"}
    res["seconds"] = round(time.time() - t0, 1)
    return res


def test_tool_call(base, key, model):
    tools = [{"type": "function", "function": {"name": "search", "description": "Search news sources",
              "parameters": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}}}]
    msg = chat(base, key, model, [{"role": "user", "content": "Find recent news about recalls at Example Rail Components GmbH. Use the search tool."}],
               tools=tools, tool_choice="auto")
    calls = msg.get("tool_calls") or []
    if not calls:
        return {"pass": False, "detail": "no tool call"}
    args = json.loads(calls[0]["function"]["arguments"])
    ok = calls[0]["function"]["name"] == "search" and bool(str(args.get("query", "")).strip())
    return {"pass": ok, "detail": f"query={args.get('query')!r}"}


def test_extract(base, key, model):
    prompt = ("Extract up to 4 factual claims about the company from the text. Reply with JSON only: "
              '{"claims":[{"statement":"...","quote":"..."}]}. Every quote must be copied exactly, character for character, from the text.\n\nTEXT:\n' + PASSAGE)
    msg = chat(base, key, model, [{"role": "user", "content": prompt}])
    claims = parse_json(msg.get("content"))["claims"]
    exact = sum(1 for c in claims if c.get("quote") and c["quote"] in PASSAGE)
    return {"pass": len(claims) >= 3 and exact == len(claims), "detail": f"{exact}/{len(claims)} quotes exact"}


def test_verify(base, key, model):
    cases = "\n".join(f'{i + 1}. statement: "{s}" | quote: "{q}"' for i, (s, q, _) in enumerate(VERIFY_CASES))
    prompt = ("For each item decide whether the quote supports the statement. Labels: verified (quote fully supports it), "
              "partial (supports only part), unsupported (quote does not address it), contradicted (quote says the opposite). "
              'Reply with JSON only: {"results":[{"id":1,"label":"..."}]}\n\n' + cases)
    msg = chat(base, key, model, [{"role": "user", "content": prompt}])
    got = {int(r["id"]): str(r["label"]).lower() for r in parse_json(msg.get("content"))["results"]}
    correct = sum(1 for i, (_, _, label) in enumerate(VERIFY_CASES) if got.get(i + 1) == label)
    return {"pass": correct >= 7, "detail": f"{correct}/{len(VERIFY_CASES)} labels correct", "correct": correct}


def test_writer(base, key, model):
    claims = "\n".join(f"{cid}: {text}" for cid, text in WRITER_CLAIMS)
    prompt = ("Write 3 short report sentences using only these verified claims. Every sentence must list the claim ids it relies on. "
              'Reply with JSON only: {"sentences":[{"text":"...","claim_ids":["c_001"]}]}\n\n' + claims)
    msg = chat(base, key, model, [{"role": "user", "content": prompt}])
    sentences = parse_json(msg.get("content"))["sentences"]
    known = {cid for cid, _ in WRITER_CLAIMS}
    ok = len(sentences) >= 2 and all(s.get("claim_ids") and set(s["claim_ids"]) <= known for s in sentences)
    return {"pass": ok, "detail": f"{len(sentences)} sentences, ids valid={ok}"}


TESTS = {"tool_call": test_tool_call, "extract": test_extract, "verify": test_verify, "writer": test_writer}


def check_models(models_cfg: dict, base: str, key: str, only: str | None) -> dict:
    models = sorted({m for r in models_cfg["roles"].values() for m in r["candidates"]})
    if only:
        models = [m for m in models if m == only]

    def run(model: str) -> dict:
        print(f"  testing {model}")
        return {name: timed(lambda fn=fn: fn(base, key, model)) for name, fn in TESTS.items()}

    with ThreadPoolExecutor(3) as pool:
        results = dict(zip(models, pool.map(run, models)))

    print("\nModel results (pass/fail per test, seconds)")
    for m, r in results.items():
        cells = "  ".join(f"{n}={'PASS' if r[n]['pass'] else 'fail'}({r[n]['seconds']}s)" for n in TESTS)
        print(f"  {m}\n      {cells}")
        for n in TESTS:
            if not r[n]["pass"]:
                print(f"      - {n}: {r[n]['detail']}")

    def median_s(m):
        return statistics.median(r["seconds"] for r in results[m].values())

    def rank(role: str, tests: list[str]) -> list[str]:
        cands = [m for m in models_cfg["roles"][role]["candidates"] if m in results]
        return sorted(cands, key=lambda m: (-sum(results[m][t]["pass"] for t in tests), -results[m].get("verify", {}).get("correct", 0) if role == "verifier" else 0, median_s(m)))

    ranking = {
        "planner_writer": rank("planner_writer", ["writer", "extract", "verify"]),
        "lane_agent": rank("lane_agent", ["tool_call", "extract"]),
        "verifier": rank("verifier", ["verify"]),
    }
    print("\nSuggested order per role (passes first, then speed)")
    for role, order in ranking.items():
        print(f"  {role}: " + " > ".join(order))
    return {"tests": results, "ranking": ranking}


# ---------------------------------------------------------------- main

def main() -> int:
    load_env()
    ap = argparse.ArgumentParser()
    ap.add_argument("--steps", default="reach,tavily,models")
    ap.add_argument("--only-model")
    args = ap.parse_args()
    steps = [s.strip() for s in args.steps.split(",")]

    sources = json.loads((CONFIG / "sources.json").read_text(encoding="utf-8"))
    models_cfg = json.loads((CONFIG / "models.json").read_text(encoding="utf-8"))
    results = json.loads(RESULTS.read_text(encoding="utf-8")) if RESULTS.exists() else {}

    if "reach" in steps:
        results["reach"] = check_reach(sources)
    if "tavily" in steps:
        key = os.environ.get("TAVILY_API_KEY")
        if key:
            results["tavily"] = check_tavily(sources, key)
        else:
            print("\nSkipping tavily: TAVILY_API_KEY is not set (put it in research/.env)")
    if "models" in steps:
        key = os.environ.get("LLM_API_KEY")
        base = os.environ.get("LLM_BASE_URL", "https://integrate.api.nvidia.com/v1").rstrip("/")
        if key:
            results["models"] = check_models(models_cfg, base, key, args.only_model)
        else:
            print("\nSkipping models: LLM_API_KEY is not set (put it in research/.env)")

    RESULTS.write_text(json.dumps(results, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"\nWrote {RESULTS.relative_to(ROOT.parent)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
