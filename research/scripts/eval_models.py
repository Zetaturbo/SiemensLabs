"""Compares models on the real tasks the agents will get, over real pages from the locked sources.

    cd research
    .venv/bin/python scripts/eval_models.py --tasks planner,extract,verify,writer            # no Tavily credits
    .venv/bin/python scripts/eval_models.py --tasks agent --models gpt-oss-120b --lanes news   # live loop, uses Tavily credits
    .venv/bin/python scripts/eval_models.py --list

Tasks (all scored by code, not by another model, wherever that is possible):
  planner  Plan for a real company over the closed lane lists. Checks lanes covered, domains on the lists, company named, key risk types asked.
  extract  Claims with verbatim quotes from fixed real pages. Checks quote is an exact substring, URL is a given page, recall of gold facts.
  verify   Hand-labelled statement/quote pairs from the same pages. Checks accuracy and, above all, how often an unsupported claim is called verified.
  writer   Report sentences from verified claims. Checks every sentence cites known claim ids, all claims are used, no invented numbers.
  agent    The live lane loop with search and fetch tools on the real sources. Checks tool use, blocked off-list attempts, exact quotes.

Needs eval/evidence/*.json (scripts/build_evidence.py) and eval/gold.json. Keys come from research/.env. Results: eval/results.json.
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

import httpx

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from research_service.llm import parse_json  # noqa: E402
from research_service.sources import SourceNotAllowed, TavilyAdapter, load_lanes  # noqa: E402

EVAL = ROOT / "eval"
RESULTS = EVAL / "results.json"
CALL_TIMEOUT = 150
MAX_TOKENS = 6000
SLOW_SECONDS = {"planner": 60, "extract": 45, "verify": 30, "writer": 60, "agent": 240}  # per task call; above this a model counts as too slow

POOL = [
    ("nebius", "deepseek-ai/DeepSeek-V4-Pro"),
    ("nebius", "deepseek-ai/DeepSeek-V4-Pro-0813"),
    ("nebius", "deepseek-ai/DeepSeek-V4.1-Flash"),
    ("nebius", "moonshotai/Kimi-K3"),
    ("nebius", "moonshotai/Kimi-K2.6"),
    ("nebius", "MiniMaxAI/MiniMax-M3"),
    ("nebius", "openai/gpt-oss-120b"),
    ("nebius", "Qwen/Qwen3.5-397B-A17B"),
    ("nebius", "zai-org/GLM-5.3"),
    ("nebius", "zai-org/GLM-5.3-Flash"),
    ("nebius", "nvidia/Nemotron-3-Ultra-550b-a55b"),
    ("nebius", "nvidia/nemotron-3-super-120b-a12b"),
    ("nebius", "NousResearch/Hermes-4-405B"),
    ("nvidia", "nvidia/nemotron-3-super-120b-a12b"),
]


def load_env() -> None:
    path = ROOT / ".env"
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.strip() and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip())


def access() -> dict[str, tuple[str, str]]:
    cfg = json.loads((ROOT / "config" / "models.json").read_text(encoding="utf-8"))["providers"]
    out = {}
    for name, p in cfg.items():
        key = os.environ.get(p["key_env"])
        if key:
            base = p.get("base_url") or os.environ.get(p.get("base_url_env", ""), p.get("base_url_default", ""))
            out[name] = (base.rstrip("/"), key)
    return out


class Model:
    def __init__(self, provider: str, name: str, base: str, key: str):
        self.provider, self.name, self.base, self.key = provider, name, base, key
        self.label = f"{provider}:{name}"

    def chat(self, messages: list[dict], **extra) -> dict:
        """One call. Returns {message, seconds, finish, completion_tokens} or raises with a short reason."""
        body = {"model": self.name, "messages": messages, "temperature": 0, "max_tokens": MAX_TOKENS, **extra}
        t0 = time.time()
        for attempt in range(3):
            r = httpx.post(f"{self.base}/chat/completions", json=body, headers={"Authorization": f"Bearer {self.key}"}, timeout=CALL_TIMEOUT)
            if r.status_code in (429, 500, 502, 503, 504) and attempt < 2:
                time.sleep(4 * (attempt + 1))
                continue
            break
        if r.status_code != 200:
            raise RuntimeError(f"HTTP {r.status_code} {r.text[:120]}")
        j = r.json()
        choice = j["choices"][0]
        return {"message": choice["message"], "seconds": time.time() - t0, "finish": choice.get("finish_reason"),
                "completion_tokens": (j.get("usage") or {}).get("completion_tokens")}


def json_reply(res: dict):
    text = res["message"].get("content") or ""
    if not text.strip():
        raise ValueError(f"empty reply (finish_reason={res['finish']}, completion_tokens={res['completion_tokens']})")
    return parse_json(text)


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip().lower()


# ------------------------------------------------------------------ data

def load_sets() -> dict[str, dict]:
    return {p.stem: json.loads(p.read_text(encoding="utf-8")) for p in sorted((EVAL / "evidence").glob("*.json"))}


def load_gold() -> dict:
    path = EVAL / "gold.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


# ------------------------------------------------------------------ planner

RISK_WORDS = re.compile(r"recall|strike|accident|fine|lawsuit|investigation|insolven|layoff|bribery|corruption|breach|penalt|violation", re.I)
COMPANIES = ["Knorr-Bremse", "Wabtec", "Vossloh"]


def task_planner(m: Model, sets: dict, gold: dict) -> dict:
    lanes = load_lanes()
    lane_text = "\n".join(f"- {lane}: {cfg['description']}\n  allowed domains: {', '.join(cfg['domains'])}" for lane, cfg in lanes.items())
    scores, secs, notes = [], [], []
    for company in COMPANIES:
        prompt = (f"You are the research planner for a supplier risk review of the real company {company}. Four specialist agents (lanes) "
                  f"each search only their own closed list of domains:\n{lane_text}\n\n"
                  "Plan the research. Reply with JSON only: {\"plan\":[{\"lane\":\"news|company|legal|science\",\"question\":\"...\","
                  "\"domains\":[\"optional subset of that lane's allowed domains\"]}]}. Cover every lane, ask specific questions that name the company, "
                  "and between 6 and 12 questions in total. Include a sanctions question and an adverse-news question.")
        try:
            res = m.chat([{"role": "user", "content": prompt}])
            plan = json_reply(res)["plan"]
        except Exception as e:
            scores.append(0.0)
            notes.append(f"{company}: {type(e).__name__}: {str(e)[:100]}")
            continue
        secs.append(res["seconds"])
        qs = [q for q in plan if isinstance(q, dict)]
        covered = {q.get("lane") for q in qs}
        off = sum(1 for q in qs for d in (q.get("domains") or []) if q.get("lane") in lanes and not any(d == a or d.endswith("." + a) for a in lanes[q["lane"]]["domains"]))
        checks = {
            "all_lanes": covered >= set(lanes),
            "size_6_12": 6 <= len(qs) <= 12,
            "no_off_list_domains": off == 0,
            "company_named": sum(company.lower().split("-")[0] in str(q.get("question", "")).lower() for q in qs) >= 0.8 * max(len(qs), 1),
            "distinct": len({norm(str(q.get("question", ""))) for q in qs}) == len(qs),
            "sanctions_question": any(q.get("lane") == "legal" and "sanction" in str(q.get("question", "")).lower() for q in qs),
            "adverse_news_question": any(q.get("lane") == "news" and RISK_WORDS.search(str(q.get("question", ""))) for q in qs),
        }
        scores.append(sum(checks.values()) / len(checks))
        failed = [k for k, v in checks.items() if not v]
        if failed:
            notes.append(f"{company}: failed {failed}")
    return {"score": round(statistics.mean(scores), 3), "seconds": round(statistics.mean(secs), 1) if secs else None, "notes": notes}


# ------------------------------------------------------------------ extract

def extract_prompt(company: str, lane: str, pages: list[dict], key: str = "text") -> str:
    body = "\n\n".join(f"SOURCE {i + 1}\nurl: {p['url']}\n{p[key]}" for i, p in enumerate(pages))
    return (f"You are the {lane} research agent for a supplier risk review of {company}. Read the sources and extract up to 6 claims that matter for "
            "supplier risk or due diligence (events, legal or regulatory matters, safety, finance, governance, sustainability). "
            "Every quote must be copied exactly, character for character, from one source, and source_url must be that source's url. "
            "Reply with JSON only: {\"claims\":[{\"statement\":\"...\",\"severity\":\"low|moderate|elevated|high\",\"quote\":\"...\",\"source_url\":\"...\"}]}\n\n" + body)


def score_claims(claims: list, pages: list[dict], key: str) -> dict:
    texts = {p["url"]: norm(p[key]) for p in pages}
    claims = [c for c in claims if isinstance(c, dict)]
    exact = sum(1 for c in claims if c.get("source_url") in texts and norm(str(c.get("quote", ""))) and norm(str(c["quote"])) in texts[c["source_url"]])
    valid_url = sum(1 for c in claims if c.get("source_url") in texts)
    return {"n": len(claims), "exact": exact, "valid_url": valid_url}


def task_extract(m: Model, sets: dict, gold: dict) -> dict:
    per, secs, notes, recalls, failed = [], [], [], [], 0
    for name, s in sets.items():
        if not s["pages"]:
            continue
        try:
            res = m.chat([{"role": "user", "content": extract_prompt(s["company"], s["lane"], s["pages"])}])
            claims = json_reply(res)["claims"]
        except Exception as e:
            per.append({"n": 0, "exact": 0, "valid_url": 0})
            failed += 1
            if (gold.get(name) or {}).get("anchors"):
                recalls.append(0.0)  # a set with no usable answer finds none of the gold facts
            notes.append(f"{name}: {type(e).__name__}: {str(e)[:100]}")
            continue
        secs.append(res["seconds"])
        sc = score_claims(claims, s["pages"], "text")
        per.append(sc)
        anchors = (gold.get(name) or {}).get("anchors") or []
        if anchors:
            quotes = " || ".join(norm(str(c.get("quote", ""))) + " " + norm(str(c.get("statement", ""))) for c in claims if isinstance(c, dict))
            recalls.append(sum(norm(a) in quotes for a in anchors) / len(anchors))
    n = sum(p["n"] for p in per)
    return {
        "exact_quote_rate": round(sum(p["exact"] for p in per) / n, 3) if n else 0.0,
        "valid_url_rate": round(sum(p["valid_url"] for p in per) / n, 3) if n else 0.0,
        "gold_recall": round(statistics.mean(recalls), 3) if recalls else None,
        "claims_per_set": round(n / max(len(per), 1), 1),
        "failed_sets": failed,
        "seconds": round(statistics.mean(secs), 1) if secs else None,
        "notes": notes[:4],
    }


# ------------------------------------------------------------------ verify

LABELS = ["verified", "partial", "unsupported", "contradicted"]


def task_verify(m: Model, sets: dict, gold: dict) -> dict:
    correct = total = false_verified = non_verified = false_reject = verified_total = 0
    secs, notes = [], []
    for name, g in gold.items():
        cases = g.get("cases") or []
        if not cases or name not in sets:
            continue
        s = sets[name]
        src = "\n\n".join(f"SOURCE url: {p['url']}\n{p['text']}" for p in s["pages"])
        listing = "\n".join(f'{i + 1}. statement: "{c["statement"]}" | quote: "{c["quote"]}"' for i, c in enumerate(cases))
        prompt = ("You are a strict fact checker. For each item decide whether the quote supports the statement, using the source text only. "
                  "Labels: verified (the quote fully supports the statement), partial (supports only part, or the statement adds something the quote does not say), "
                  "unsupported (the quote does not address the statement), contradicted (the quote says the opposite or different facts such as another number, date or party). "
                  "Reply with JSON only: {\"results\":[{\"id\":1,\"label\":\"...\"}]}\n\nSOURCES\n" + src + "\n\nITEMS\n" + listing)
        try:
            res = m.chat([{"role": "user", "content": prompt}])
            got = {int(r["id"]): str(r["label"]).strip().lower() for r in json_reply(res)["results"]}
        except Exception as e:
            notes.append(f"{name}: {type(e).__name__}: {str(e)[:100]}")
            got = {}
            res = None
        if res:
            secs.append(res["seconds"])
        for i, c in enumerate(cases):
            pred = got.get(i + 1)
            total += 1
            correct += pred == c["label"]
            if c["label"] == "verified":
                verified_total += 1
                false_reject += pred != "verified"
            else:
                non_verified += 1
                false_verified += pred == "verified"
    return {
        "accuracy": round(correct / total, 3) if total else None,
        "false_verified_rate": round(false_verified / non_verified, 3) if non_verified else None,
        "false_reject_rate": round(false_reject / verified_total, 3) if verified_total else None,
        "cases": total,
        "seconds": round(statistics.mean(secs), 1) if secs else None,
        "notes": notes[:4],
    }


# ------------------------------------------------------------------ writer

def task_writer(m: Model, sets: dict, gold: dict) -> dict:
    scores, secs, notes = [], [], []
    for company in COMPANIES:
        claims = []
        for name, g in gold.items():
            if sets.get(name, {}).get("company") == company:
                for c in g.get("cases") or []:
                    if c["label"] == "verified" and len(claims) < 6:
                        claims.append({"claim_id": f"c_{len(claims) + 1:03d}", "statement": c["statement"], "quote": c["quote"]})
        if len(claims) < 3:
            continue
        listing = "\n".join(f"{c['claim_id']}: {c['statement']} (quote: \"{c['quote']}\")" for c in claims)
        prompt = (f"You write the findings section of a supplier risk report on {company}. Use only these verified claims. Write one sentence per claim or "
                  "group of closely related claims. Every sentence must list the claim ids it relies on and must not add facts, numbers or dates that are not in those claims. "
                  "Reply with JSON only: {\"sentences\":[{\"text\":\"...\",\"claim_ids\":[\"c_001\"]}]}\n\n" + listing)
        try:
            res = m.chat([{"role": "user", "content": prompt}])
            sentences = json_reply(res)["sentences"]
        except Exception as e:
            scores.append(0.0)
            notes.append(f"{company}: {type(e).__name__}: {str(e)[:100]}")
            continue
        secs.append(res["seconds"])
        by_id = {c["claim_id"]: c for c in claims}
        used, invented, bad_ids = set(), 0, 0
        for s in sentences:
            ids = s.get("claim_ids") or []
            bad_ids += (not ids) or any(i not in by_id for i in ids)
            used |= set(ids)
            allowed_digits = set(re.findall(r"\d+", " ".join(by_id[i]["statement"] + " " + by_id[i]["quote"] for i in ids if i in by_id)))
            invented += any(d not in allowed_digits for d in re.findall(r"\d+", str(s.get("text", ""))))
        checks = {"ids_valid": bad_ids == 0 and bool(sentences), "all_claims_used": used >= set(by_id), "no_invented_numbers": invented == 0}
        scores.append(sum(checks.values()) / len(checks))
        failed = [k for k, v in checks.items() if not v]
        if failed:
            notes.append(f"{company}: failed {failed}")
    return {"score": round(statistics.mean(scores), 3) if scores else None, "seconds": round(statistics.mean(secs), 1) if secs else None, "notes": notes[:4]}


# ------------------------------------------------------------------ agent (live)

AGENT_TOOLS = [
    {"type": "function", "function": {"name": "search", "description": "Search this lane's closed list of sources. Optionally narrow to some of its domains.",
     "parameters": {"type": "object", "properties": {"query": {"type": "string"}, "domains": {"type": "array", "items": {"type": "string"}}}, "required": ["query"]}}},
    {"type": "function", "function": {"name": "fetch", "description": "Fetch the full text of a page found by search.",
     "parameters": {"type": "object", "properties": {"url": {"type": "string"}}, "required": ["url"]}}},
]


def task_agent(m: Model, adapter: TavilyAdapter, lane: str, company: str, max_steps: int = 6) -> dict:
    allowed = ", ".join(adapter.allowed_domains(lane))
    system = (f"You are the {lane} research agent for a supplier risk review of the real company {company}. You can only reach these domains: {allowed}. "
              "Use search, then fetch the most relevant pages. Finish within 6 tool calls. Then reply with JSON only: "
              "{\"claims\":[{\"statement\":\"...\",\"severity\":\"low|moderate|elevated|high\",\"quote\":\"...\",\"source_url\":\"...\"}]}. "
              "Every quote must be copied exactly from a page you fetched, and source_url must be that page. Report at most 6 claims that matter for supplier risk.")
    messages = [{"role": "system", "content": system}, {"role": "user", "content": f"Research {company} for the {lane} lane."}]
    fetched: dict[str, str] = {}
    stats = {"tool_calls": 0, "blocked": 0, "tool_errors": 0, "tavily_calls": 0}
    t0 = time.time()
    final = None
    try:
        for step in range(max_steps + 1):
            extra = {"tools": AGENT_TOOLS, "tool_choice": "auto"} if step < max_steps else {}
            if step == max_steps:
                messages.append({"role": "user", "content": "Stop using tools now and reply with the JSON claims."})
            res = m.chat(messages, **extra)
            msg = res["message"]
            calls = msg.get("tool_calls") or []
            if not calls:
                final = msg.get("content") or ""
                break
            messages.append({"role": "assistant", "content": msg.get("content") or "", "tool_calls": calls})
            for call in calls:
                stats["tool_calls"] += 1
                try:
                    args = json.loads(call["function"]["arguments"] or "{}")
                    name = call["function"]["name"]
                    if name == "search":
                        stats["tavily_calls"] += 1
                        hits = adapter.search(str(args.get("query", "")), lane, 5, args.get("domains") or None)
                        out = [{"title": h.title, "url": h.url, "snippet": h.snippet[:300], "published": h.published} for h in hits]
                    elif name == "fetch":
                        stats["tavily_calls"] += 1
                        page = adapter.fetch(str(args.get("url", "")), lane)
                        fetched[page.url] = page.text
                        out = {"url": page.url, "text": page.text[:5000]}
                    else:
                        raise ValueError(f"unknown tool {name}")
                except SourceNotAllowed as e:
                    stats["blocked"] += 1
                    out = {"error": str(e)}
                except Exception as e:
                    stats["tool_errors"] += 1
                    out = {"error": f"{type(e).__name__}: {str(e)[:100]}"}
                messages.append({"role": "tool", "tool_call_id": call.get("id", ""), "content": json.dumps(out, ensure_ascii=False)})
        claims = parse_json(final)["claims"] if final else []
    except Exception as e:
        return {**stats, "seconds": round(time.time() - t0, 1), "error": f"{type(e).__name__}: {str(e)[:120]}", "n": 0, "exact_quote_rate": 0.0}
    pages = [{"url": u, "text": t} for u, t in fetched.items()]
    sc = score_claims(claims, pages, "text")
    return {**stats, "seconds": round(time.time() - t0, 1), "n": sc["n"], "exact_quote_rate": round(sc["exact"] / sc["n"], 3) if sc["n"] else 0.0,
            "pages_fetched": len(fetched)}


# ------------------------------------------------------------------ main

def main() -> int:
    load_env()
    ap = argparse.ArgumentParser()
    ap.add_argument("--tasks", default="planner,extract,verify,writer")
    ap.add_argument("--models", help="comma separated substrings of 'provider:model'")
    ap.add_argument("--lanes", default="news,legal")
    ap.add_argument("--company", default="Knorr-Bremse")
    ap.add_argument("--list", action="store_true")
    args = ap.parse_args()
    acc = access()
    pool = [Model(p, n, *acc[p]) for p, n in POOL if p in acc]
    if args.models:
        wanted = [w.strip() for w in args.models.split(",")]
        pool = [m for m in pool if any(w.lower() in m.label.lower() for w in wanted)]
    if args.list:
        print("\n".join(m.label for m in pool))
        return 0
    tasks = [t.strip() for t in args.tasks.split(",")]
    sets, gold = load_sets(), load_gold()
    results = json.loads(RESULTS.read_text(encoding="utf-8")) if RESULTS.exists() else {}
    adapter = TavilyAdapter(os.environ["TAVILY_API_KEY"]) if "agent" in tasks else None

    def run(m: Model) -> tuple[str, dict]:
        out = {}
        for t in tasks:
            try:
                if t == "agent":
                    out[t] = {lane: task_agent(m, adapter, lane, args.company) for lane in args.lanes.split(",")}
                else:
                    out[t] = {"planner": task_planner, "extract": task_extract, "verify": task_verify, "writer": task_writer}[t](m, sets, gold)
            except Exception as e:
                out[t] = {"error": f"{type(e).__name__}: {str(e)[:120]}"}
            print(f"  {m.label} {t}: {json.dumps({k: v for k, v in out[t].items() if k != 'notes'})[:200]}", flush=True)
        return m.label, out

    with ThreadPoolExecutor(3) as ex:
        for label, out in ex.map(run, pool):
            results.setdefault(label, {}).update(out)
    on_disk = json.loads(RESULTS.read_text(encoding="utf-8")) if RESULTS.exists() else {}
    for label, out in results.items():
        on_disk.setdefault(label, {}).update(out)
    RESULTS.write_text(json.dumps(on_disk, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"\nWrote {RESULTS.relative_to(ROOT.parent)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
