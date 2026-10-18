"""Tool registry. A tool takes the JSON input object and returns an envelope (see envelope.py).

Tools are added here as their tickets land (docs/TICKETS.md). Until then the name is listed in PLANNED_TOOLS
so callers get "not implemented yet" instead of "unknown tool".
"""

from typing import Callable

TOOLS: dict[str, Callable[[dict], dict]] = {}

PLANNED_TOOLS = [
    "research_company",
    "get_research_status",
    "confirm_entity",
    "get_research_report",
    "get_research_claims",
    "list_research_jobs",
]
