"""Planner: turns the confirmed company into research questions per lane.

A model writes the plan. If it fails or leaves a lane empty, default questions are used, so a run never stops at the planning step.
"""

from .llm import LLMError, parse_json, requires_json

QUESTIONS_PER_LANE = 3

DEFAULTS = {
    "news": ["Has {c} had a recall, accident, strike, lawsuit, fine or other adverse event in the last three years?",
             "Is there negative news about the finances or management of {c}?"],
    "company": ["What does {c} say about its governance, sustainability and certifications in its own reports and releases?",
                "Who owns {c} and how large is it?"],
    "legal": ["Is {c} on a sanctions list, or named in an enforcement, competition or court case?",
              "Are there insolvency notices or register entries for {c}?"],
    "science": ["Has {c} been involved in a safety incident, accident investigation or product recall?",
                "Which patents or technical findings relate to the products of {c}?"],
}


def default_plan(entity: dict, lanes: list[str]) -> dict[str, list[str]]:
    return {lane: [q.format(c=entity["legal_name"]) for q in DEFAULTS[lane]] for lane in lanes}


def make_plan(entity: dict, lanes: dict, chain, emit) -> dict[str, list[str]]:
    lane_text = "\n".join(f"- {lane}: {cfg['description']}" for lane, cfg in lanes.items())
    prompt = (f"You are the research planner for a supplier risk review of the real company {entity['legal_name']}"
              f"{' (' + entity['country'] + ')' if entity.get('country') else ''}. Four specialist agents (lanes) each search only their own closed list of sources:\n"
              f"{lane_text}\n\nPlan the research. Reply with JSON only: "
              '{"plan":[{"lane":"news|company|legal|science","question":"..."}]}. '
              f"Cover every lane with up to {QUESTIONS_PER_LANE} specific questions that name the company. Include a sanctions question and an adverse-news question.")
    plan: dict[str, list[str]] = {lane: [] for lane in lanes}
    try:
        _, msg = chain.chat([{"role": "user", "content": prompt}], validate=requires_json("plan"))
        for item in parse_json(msg.get("content"))["plan"]:
            lane, question = item.get("lane"), str(item.get("question", "")).strip()
            if lane in plan and question and len(plan[lane]) < QUESTIONS_PER_LANE:
                plan[lane].append(question)
    except (LLMError, ValueError, KeyError, TypeError, AttributeError):
        plan = {lane: [] for lane in lanes}
    fallback = default_plan(entity, list(lanes))
    used_default = [lane for lane in lanes if not plan[lane]]
    for lane in used_default:
        plan[lane] = fallback[lane]
    total = sum(len(q) for q in plan.values())
    note = f" ({len(used_default)} lanes use default questions)" if used_default else ""
    emit("plan", f"Planned {total} research questions across {len(lanes)} lanes{note}", "planner")
    return plan
