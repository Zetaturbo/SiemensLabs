"""Input guards for the research tools."""

import re

from .envelope import ToolError

# Dataset ids: SUPP_00018 (portfolio) and BRK_0020 (brakes). Their names are invented, so there is nothing to research.
SYNTHETIC_ID = re.compile(r"\b(?:SUPP|BRK)_\d+\b", re.IGNORECASE)


def reject_synthetic(company_name: str) -> str:
    """Returns the cleaned company name, or raises SYNTHETIC_ENTITY when it is a dataset supplier id."""
    name = (company_name or "").strip()
    if not name:
        raise ToolError("INVALID_INPUT", "company_name is required")
    match = SYNTHETIC_ID.search(name)
    if match:
        raise ToolError("SYNTHETIC_ENTITY", f"{match.group(0).upper()} is a dataset supplier with an invented name and cannot be researched on the web. "
                        "Research the real company behind it by its legal name.")
    return name
