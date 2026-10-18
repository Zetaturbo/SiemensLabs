"""Lane agent: searches and reads its lane's closed source list and returns claims with verbatim quotes.

The model never decides what is verbatim: the service checks every quote against the stored page text (clean_page_text output)
and drops what is not there. The verifier (verifier.py) then judges whether each remaining quote supports its statement.
"""

import json
import re
import time
from dataclasses import dataclass, field
from email.utils import parsedate_to_datetime
from urllib.parse import urlparse

from .llm import LLMError, parse_json, requires_json
from .sources import Page, SourceNotAllowed

CATEGORIES = ["financial", "legal", "sanctions", "quality", "safety", "esg", "operations", "geopolitical"]
SEVERITIES = ["low", "moderate", "elevated", "high"]
# The dataset dimension each category mirrors (docs/SPEC.md, claim schema).
DIMENSION = {"financial": "financial_health", "legal": "compliance_risk", "sanctions": "compliance_risk", "quality": "quality_risk",
             "safety": "safety_incident", "esg": "esg_performance", "operations": "operational_resilience", "geopolitical": "geopolitical_risk"}

PAGE_CHARS = 6000  # text of a fetched page shown to the model; the stored text is longer

# Searches the service runs itself for every lane before the agent starts (checked on real runs: with only model-chosen queries the same
# company gave different coverage from one run to the next). The agent sees these results and then searches and fetches as it sees fit.
BASELINE_QUERIES = {
    "news": ["{c} recall OR accident OR strike OR fine OR lawsuit", "{c} insolvency OR layoffs OR fraud OR investigation"],
    "company": ["{c} annual report sustainability governance", "{c} supplier code of conduct certifications ownership"],
    "legal": ["{c} sanctions OR investigation OR lawsuit OR fine", "{c} antitrust OR competition OR cartel OR court judgment OR insolvency"],
    "science": ["{c} safety incident OR accident investigation OR recall", "{c} patent OR technical report"],
}
SEED_RESULTS = 8

TOOLS = [
    {"type": "function", "function": {"name": "search", "description": "Search this lane's closed list of sources. Optionally narrow to some of its domains.",
     "parameters": {"type": "object", "properties": {"query": {"type": "string"}, "domains": {"type": "array", "items": {"type": "string"}}}, "required": ["query"]}}},
    {"type": "function", "function": {"name": "fetch", "description": "Read a page found by search. 'focus' says what to look for, so long pages return the relevant parts.",
     "parameters": {"type": "object", "properties": {"url": {"type": "string"}, "focus": {"type": "string"}}, "required": ["url"]}}},
]


def collapse(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def iso_date(value: str | None) -> str | None:
    """YYYY-MM-DD from an ISO date or an RFC 2822 date (Tavily); None when it cannot be read."""
    if not value:
        return None
    m = re.match(r"\d{4}-\d{2}-\d{2}", value)
    if m:
        return m.group(0)
    try:
        return parsedate_to_datetime(value).date().isoformat()
    except (TypeError, ValueError):
        return None


def host_of(url: str) -> str:
    return (urlparse(url).hostname or "").removeprefix("www.")


@dataclass
class LaneResult:
    lane: str
    claims: list[dict] = field(default_factory=list)
    pages: dict[str, Page] = field(default_factory=dict)
    dropped: int = 0  # claims whose quote or source was not verbatim in a fetched page
    tool_calls: int = 0
    error: str | None = None


def system_prompt(lane: str, description: str, domains: list[str], entity: dict, questions: list[str], max_steps: int, max_claims: int) -> str:
    where = f" ({entity['country']})" if entity.get("country") else ""
    todo = "\n".join(f"- {q}" for q in questions)
    return (
        f"You are the {lane} research agent in a supplier risk review of {entity['legal_name']}{where}. {description}\n"
        f"You can only reach these sources: {', '.join(domains)}.\n\nQuestions to answer:\n{todo}\n\n"
        f"Use the search tool, then fetch the pages that matter. Use at most {max_steps} tool calls in total. Then reply with JSON only:\n"
        '{"claims":[{"statement":"...","category":"' + "|".join(CATEGORIES) + '","severity":"low|moderate|elevated|high","quote":"...","source_url":"...","event_date":"YYYY-MM-DD, YYYY-MM or YYYY, or null"}]}\n'
        f"Rules: report only facts about {entity['legal_name']} itself, not a similarly named company or a competitor. Every quote must be copied "
        "exactly, character for character, from a page you fetched, and source_url must be that page. "
        f"Report at most {max_claims} claims. Prefer adverse events, legal and regulatory matters and safety issues; include a neutral or positive fact only when it directly answers one of the questions "
        f"(for example a certification or the ownership), and skip plain facts such as headcount or addresses. event_date is when the event happened, only if the page states it, otherwise null. "
        f"If you find nothing relevant, reply {{\"claims\": []}}. "
        "Severity: high = serious legal, safety or financial event with direct impact; elevated = significant; moderate = notable; low = minor or routine."
    )


def normalize_claims(raw: list, pages: dict[str, Page], lane: str, published: dict[str, str | None], max_claims: int) -> tuple[list[dict], int]:
    """Keeps claims whose source was fetched and whose quote is verbatim in that page. Returns (claims, number dropped)."""
    claims, dropped, seen = [], 0, set()
    stored = {url: collapse(p.text) for url, p in pages.items()}
    for item in raw:
        if not isinstance(item, dict):
            dropped += 1
            continue
        url, quote = str(item.get("source_url", "")), collapse(str(item.get("quote", "")))
        statement = collapse(str(item.get("statement", "")))
        if not statement or not quote or url not in stored or quote not in stored[url]:
            dropped += 1
            continue
        key = (url, quote)
        if key in seen:
            continue
        seen.add(key)
        category = str(item.get("category", "")).lower()
        category = category if category in CATEGORIES else "operations"
        severity = str(item.get("severity", "")).lower()
        page = pages[url]
        event_date = str(item.get("event_date") or "").strip()
        if not re.fullmatch(r"\d{4}(-\d{2}(-\d{2})?)?", event_date) or event_date[:4] not in stored[url]:
            event_date = None  # a date the page does not even mention by year is not trusted
        claims.append({"statement": statement, "category": category, "dimension": DIMENSION[category],
                       "severity": severity if severity in SEVERITIES else "moderate", "quote": quote, "source_url": url,
                       "source_title": page.title if page.title != url else None, "publisher": page.publisher or host_of(url),
                       "published": iso_date(page.published or published.get(url)), "event_date": event_date, "retrieved_at": page.retrieved_at, "agent": lane,
                       "status": "pending", "corroborated_by": [], "simulated": page.simulated})
    return claims[:max_claims], dropped + max(0, len(claims) - max_claims)


def baseline_search(lane: str, entity: dict, adapter, published: dict, emit) -> list[dict]:
    """The fixed searches for this lane. A failing search is skipped: the agent can still search on its own."""
    seen, found = set(), []
    for template in BASELINE_QUERIES[lane]:
        query = template.format(c=entity["legal_name"])
        emit("search", f"Searching {lane} sources: {query[:90]}", lane)
        try:
            hits = adapter.search(query, lane, 5)
        except Exception:
            continue
        for h in hits:
            if h.url not in seen:
                seen.add(h.url)
                published[h.url] = h.published
                found.append({"title": h.title, "url": h.url, "snippet": h.snippet[:300], "published": h.published})
    return found[:SEED_RESULTS]


def run_lane_agent(lane, entity, questions, adapter, chain, *, description, domains, max_steps, max_claims, deadline, emit) -> LaneResult:
    result = LaneResult(lane)
    published: dict[str, str | None] = {}
    seed = baseline_search(lane, entity, adapter, published, emit)
    intro = f"Research {entity['legal_name']} for the {lane} lane."
    if seed:
        intro += ("\nThese search results were already collected for you. Fetch the pages that matter, and search again with other queries if they are not enough:\n"
                  + json.dumps(seed, ensure_ascii=False))
    messages = [{"role": "system", "content": system_prompt(lane, description, domains, entity, questions, max_steps, max_claims)},
                {"role": "user", "content": intro}]
    final = None
    try:
        for step in range(max_steps + 1):
            out_of_time = time.time() > deadline
            if step == max_steps or out_of_time:
                messages.append({"role": "user", "content": "Stop using tools now and reply with the JSON claims."})
                extra = {}
            else:
                extra = {"tools": TOOLS, "tool_choice": "auto"}
            _, msg = chain.chat(messages, validate=requires_json("claims"), **extra)
            calls = msg.get("tool_calls") or []
            if not calls or not extra:
                final = msg.get("content") or ""
                break
            messages.append({"role": "assistant", "content": msg.get("content") or "", "tool_calls": calls})
            for call in calls:
                result.tool_calls += 1
                messages.append({"role": "tool", "tool_call_id": call.get("id", ""), "content": json.dumps(
                    run_tool(call, lane, adapter, result.pages, published, emit, entity), ensure_ascii=False)})
        raw = parse_json(final)["claims"] if final else []
    except (LLMError, ValueError, KeyError, TypeError) as e:
        result.error = f"{type(e).__name__}: {str(e)[:160]}"
        return result
    result.claims, result.dropped = normalize_claims(raw, result.pages, lane, published, max_claims)
    return result


def run_tool(call: dict, lane: str, adapter, pages: dict[str, Page], published: dict, emit, entity: dict) -> object:
    """Runs one tool call. Errors, including refused URLs, go back to the model as a tool result instead of ending the run."""
    try:
        name = call["function"]["name"]
        args = json.loads(call["function"].get("arguments") or "{}")
        if name == "search":
            query = str(args.get("query", ""))
            emit("search", f"Searching {lane} sources: {query[:90]}", lane)
            hits = adapter.search(query, lane, 5, args.get("domains") or None)
            for h in hits:
                published[h.url] = h.published
            return [{"title": h.title, "url": h.url, "snippet": h.snippet[:300], "published": h.published} for h in hits]
        if name == "fetch":
            url = str(args.get("url", ""))
            emit("search", f"Reading {host_of(url)}", lane)
            page = adapter.fetch(url, lane, str(args.get("focus") or entity["legal_name"]))
            pages[url] = page
            return {"url": url, "text": page.text[:PAGE_CHARS]}
        return {"error": f"unknown tool {name}"}
    except SourceNotAllowed as e:
        return {"error": str(e)}
    except Exception as e:  # a failing page or search must not end the run
        return {"error": f"{type(e).__name__}: {str(e)[:100]}"}
