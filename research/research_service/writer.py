"""Report writer: builds the report from verified claims only.

A model writes the summary and groups claims into findings, but code checks the result: every finding must cite known verified
claim ids and may not contain a number that is not in the claims it cites. Whatever fails the check is replaced by the claim text.
The overall assessment, category assessments, counts and limitations are computed from the claims, never written by a model.
"""

import re

from .agents import CATEGORIES, SEVERITIES, collapse, host_of
from .llm import LLMError, parse_json, requires_json
from .models import ResearchReport

RANK = {s: i for i, s in enumerate(SEVERITIES)}


def digits(text: str) -> set[str]:
    return set(re.findall(r"\d+", text))


def claim_digits(claims: list[dict]) -> set[str]:
    return digits(" ".join(f"{c['statement']} {c['quote']} {c.get('published') or ''} {c.get('event_date') or ''}" for c in claims))


def top_severity(claims: list[dict]) -> str:
    return max((c["severity"] for c in claims), key=lambda s: RANK[s], default="low")


def source_of(c: dict) -> dict:
    return {"title": c.get("source_title") or c["source_url"], "url": c["source_url"], "publisher": c["publisher"], "accessed": (c.get("retrieved_at") or "")[:10] or None}


def make_flag(group: list[dict], title: str, finding: str) -> dict:
    sources, seen = [], set()
    for c in group:
        if c["source_url"] not in seen:
            seen.add(c["source_url"])
            sources.append(source_of(c))
    dates = sorted(d for c in group if (d := c.get("event_date") or c.get("published")))
    return {"category": group[0]["category"], "dimension": group[0]["dimension"], "severity": top_severity(group), "title": title, "finding": finding,
            "date": dates[-1] if dates else None, "claim_ids": [c["claim_id"] for c in group], "verification": "verified", "sources": sources}


def short(text: str, n: int = 90) -> str:
    return text if len(text) <= n else text[: n - 1].rsplit(" ", 1)[0] + "..."


def write_findings(entity: dict, verified: list[dict], chain) -> tuple[str | None, list[dict]]:
    """Asks the model for a summary and groups. Returns (summary or None, flags). Invalid parts are dropped."""
    by_id = {c["claim_id"]: c for c in verified}
    listing = "\n".join(f"{c['claim_id']} [{c['category']}, {c['severity']}, {c.get('event_date') or c.get('published') or 'undated'}, {c['publisher']}]: {c['statement']}" for c in verified)
    prompt = (f"You write the findings of a supplier risk report on {entity['legal_name']}. Use only these verified claims.\n{listing}\n\n"
              "Reply with JSON only: {\"summary\":\"2 to 4 sentences\",\"flags\":[{\"claim_ids\":[\"c_001\"],\"title\":\"at most 10 words\",\"finding\":\"1 or 2 sentences\"}]}. "
              "Group claims about the same event into one flag. Every claim should appear in a flag. Name the year of an event when the claim gives it, so older events do not read as current. Do not add facts, numbers or dates that are not in the claims of that flag, "
              "and do not state how many claims there are.")
    try:
        _, msg = chain.chat([{"role": "user", "content": prompt}], validate=requires_json("summary", "flags"))
        data = parse_json(msg.get("content"))
    except (LLMError, ValueError):
        return None, []
    flags, used = [], set()
    for f in data.get("flags") or []:
        ids = [i for i in map(str, f.get("claim_ids") or []) if i in by_id and i not in used]
        title, finding = collapse(str(f.get("title", ""))), collapse(str(f.get("finding", "")))
        if not ids or not title or not finding:
            continue
        group = [by_id[i] for i in ids]
        if not digits(f"{title} {finding}") <= claim_digits(group):
            finding = " ".join(c["statement"] for c in group)
            title = short(group[0]["statement"])
        used.update(ids)
        flags.append(make_flag(group, title, finding))
    summary = collapse(str(data.get("summary", "")))
    if not summary or not digits(summary) <= claim_digits(verified):
        summary = None
    return summary, flags


def build_report(job: dict, entity: dict, claims: list[dict], lane_notes: list[str], dropped_unverbatim: int, unchecked: int, chain) -> dict:
    verified = [c for c in claims if c["status"] == "verified"]
    partial = [c for c in claims if c["status"] == "partial"]
    rejected = [c for c in claims if c["status"] in ("unsupported", "contradicted")]
    summary, flags = write_findings(entity, verified, chain) if verified else (None, [])
    covered = {i for f in flags for i in f["claim_ids"]}
    for c in verified:  # nothing verified may be left out of the report
        if c["claim_id"] not in covered:
            flags.append(make_flag([c], short(c["statement"]), c["statement"]))
    flags.sort(key=lambda f: -RANK[f["severity"]])
    name = entity["legal_name"]
    if summary is None:
        summary = (f"{len(verified)} findings about {name} were verified against their sources; see the findings below." if verified
                   else f"No findings about {name} could be verified in the checked sources.")
    if job.get("simulated"):
        summary = "Simulated example. " + summary
    categories = []
    for cat in CATEGORIES:
        group = [c for c in verified if c["category"] == cat]
        if group:
            categories.append({"category": cat, "assessment": top_severity(group), "rationale": f"{len(group)} verified finding(s) from {len({c['publisher'] for c in group})} source(s)."})
        else:
            categories.append({"category": cat, "assessment": "low", "rationale": "No verified findings in the checked sources. This is not proof that nothing exists."})
    sources, seen = [], set()
    for c in verified:
        if c["source_url"] not in seen:
            seen.add(c["source_url"])
            sources.append({"title": c.get("source_title") or c["source_url"], "url": c["source_url"]})
    parts = []
    if job.get("simulated"):
        parts.append("Simulated data.")
    parts.append(f"{len(claims) + dropped_unverbatim} claims were extracted: {len(verified)} verified, {len(partial)} unconfirmed and not used as findings, "
                 f"{len(rejected) + dropped_unverbatim} dropped (the quote was not found in the page or did not support the statement).")
    if unchecked:
        parts.append(f"{unchecked} claims could not be checked because the verifier was unavailable.")
    parts.extend(lane_notes)
    parts.append("Only the closed source lists were searched, so a lane with no findings does not prove that nothing exists.")
    report = {"company": {"legal_name": name, "country": entity.get("country"), "website": entity.get("website"), "lei": entity.get("lei")},
              "summary": summary, "overall_assessment": top_severity(verified), "risk_flags": flags, "category_assessment": categories, "sources": sources,
              "limitations": " ".join(parts), "job_id": job["job_id"], "supplier_id": job.get("supplier_id"), "simulated": bool(job.get("simulated")),
              "claims": claims, "verification_summary": {"total": len(claims) + dropped_unverbatim, "verified": len(verified), "partial": len(partial),
                                                         "dropped": len(rejected) + dropped_unverbatim}}
    return ResearchReport.model_validate(report).model_dump(mode="json")
