"""Verifier: decides, for every claim, whether its quote supports its statement.

The quote is already known to be verbatim in the stored page (agents.normalize_claims). Here a different model family judges
the meaning. A claim only counts as verified when the quote supports the whole statement. A high-severity claim also needs a
second, independent source (a different publisher) that describes the same fact, otherwise it stays partial.
"""

import json
from concurrent.futures import ThreadPoolExecutor

from .agents import collapse
from .llm import LLMError, parse_json, requires_json
from .sources import Page

LABELS = ("verified", "partial", "unsupported", "contradicted")
BATCH = 3  # claims per model call: larger batches overflow reasoning models and fall back to a slower model (measured 2026-10-18)
EXCERPT = 600  # characters of page text kept on each side of the quote


def excerpt(page: Page, quote: str) -> str:
    text = collapse(page.text)
    i = text.find(quote)
    if i < 0:
        return text[: EXCERPT * 2]
    return text[max(0, i - EXCERPT): i + len(quote) + EXCERPT]


def verify_prompt(entity: dict, batch: list[dict], pages: dict[str, Page]) -> str:
    items = []
    for n, c in enumerate(batch, 1):
        items.append(f"ITEM {n}\nsource excerpt: {excerpt(pages[c['source_url']], c['quote'])}\nstatement: \"{c['statement']}\"\nquote: \"{c['quote']}\"")
    return (
        f"You are a strict fact checker for a supplier risk review of {entity['legal_name']}. For each item decide whether the quote supports the statement, "
        "using the source excerpt only. Labels: verified (the quote fully supports the statement, and it is about this company), "
        "partial (supports only part, or the statement adds something the quote does not say), unsupported (the quote does not address the statement, "
        "or the text is about a different company), contradicted (the quote says the opposite or different facts such as another number, date or party). "
        'Reply with JSON only: {"results":[{"id":1,"label":"..."}]}\n\n' + "\n\n".join(items)
    )


def verify_claims(entity: dict, claims: list[dict], pages: dict[str, Page], chain, emit) -> int:
    """Sets claim['status']. Returns the number of claims the verifier could not check."""
    batches = [claims[i:i + BATCH] for i in range(0, len(claims), BATCH)]
    emit("verify", f"Verifying {len(claims)} claims against their sources", "verifier")

    def run(batch: list[dict]) -> int:
        try:
            _, msg = chain.chat([{"role": "user", "content": verify_prompt(entity, batch, pages)}], validate=requires_json("results"))
            got = {int(r["id"]): str(r["label"]).strip().lower() for r in parse_json(msg.get("content"))["results"]}
        except (LLMError, ValueError, KeyError, TypeError):
            for c in batch:
                c["status"] = "partial"  # not checked, so never verified
            return len(batch)
        for n, c in enumerate(batch, 1):
            label = got.get(n)
            c["status"] = label if label in LABELS else "unsupported"
        return 0

    with ThreadPoolExecutor(6) as pool:
        unchecked = sum(pool.map(run, batches))
    return unchecked


def corroborate(entity: dict, claims: list[dict], chain, emit) -> None:
    """High-severity verified claims need a second source from a different publisher that states the same fact."""
    verified = [c for c in claims if c["status"] == "verified"]
    high = [c for c in verified if c["severity"] == "high"]
    if not high:
        return
    pool = {c["claim_id"]: c for c in verified}
    candidates = {c["claim_id"]: [o["claim_id"] for o in verified if o["publisher"] != c["publisher"]] for c in high}
    ask = [c for c in high if candidates[c["claim_id"]]]
    matches: dict[str, list[str]] = {}
    if ask:
        listing = "\n".join(f"{c['claim_id']}: {c['statement']}" for c in verified)
        wanted = "\n".join(f"{c['claim_id']} may only be matched with: {', '.join(candidates[c['claim_id']])}" for c in ask)
        prompt = (f"These are verified claims about {entity['legal_name']}. For each claim listed under MATCH, name the other claims that state the same fact or event "
                  "(not just the same topic). A claim must never be matched with itself. Reply with JSON only: "
                  '{"matches":[{"claim_id":"c_001","same_fact_as":["c_004"]}]}\n\nCLAIMS\n' + listing + "\n\nMATCH\n" + wanted)
        try:
            _, msg = chain.chat([{"role": "user", "content": prompt}], validate=requires_json("matches"))
            for m in parse_json(msg.get("content"))["matches"]:
                cid = str(m["claim_id"])
                matches[cid] = [o for o in map(str, m.get("same_fact_as") or []) if o in candidates.get(cid, [])]
        except (LLMError, ValueError, KeyError, TypeError):
            matches = {}
    for c in high:
        found = matches.get(c["claim_id"], [])
        if found:
            c["corroborated_by"] = found
            for o in found:
                if c["claim_id"] not in pool[o]["corroborated_by"]:
                    pool[o]["corroborated_by"].append(c["claim_id"])
        else:
            c["status"] = "partial"
            emit("verify", "A high-severity finding has a single source and stays unconfirmed", "verifier")
