"""Entity resolution: which legal entity does the buyer mean? Uses the open GLEIF API (no key).

A name resolves on its own when exactly one active entity has the same name once the legal form is removed
("Knorr-Bremse" and "Knorr-Bremse Aktiengesellschaft"). Anything else is returned as candidates for the buyer to pick.
"""

import re

import httpx

GLEIF = "https://api.gleif.org/api/v1/lei-records"
LEGAL_FORMS = re.compile(
    r"\b(aktiengesellschaft|ag|gmbh|mbh|kg|kgaa|se|sa|s\.a|sas|spa|s\.p\.a|srl|s\.r\.l|sl|s\.l|bv|b\.v|nv|n\.v|ab|as|a/s|oy|plc|ltd|limited|llc|inc|incorporated|corp|corporation|co|company|holding|group|sp|z o\.o|zoo|s\.r\.o|sro)\b\.?",
    re.IGNORECASE,
)


def core_name(name: str) -> str:
    cleaned = LEGAL_FORMS.sub(" ", name.lower())
    return re.sub(r"[^a-z0-9äöüß]+", " ", cleaned).strip()


def search_gleif(name: str, country: str | None = None, http: httpx.Client | None = None, size: int = 15) -> list[dict]:
    params = {"filter[fulltext]": name, "page[size]": str(size)}
    if country:
        params["filter[entity.legalAddress.country]"] = country.upper()
    client = http or httpx.Client(timeout=20)
    r = client.get(GLEIF, params=params, headers={"Accept": "application/vnd.api+json"})
    r.raise_for_status()
    out = []
    for rec in r.json().get("data", []):
        attrs = rec["attributes"]
        entity = attrs["entity"]
        if entity.get("status") != "ACTIVE":
            continue
        out.append({"candidate_id": rec["id"], "legal_name": entity["legalName"]["name"], "country": entity["legalAddress"].get("country"),
                    "website": None, "lei": rec["id"], "registration": attrs["registration"].get("status")})
    return out


def resolve(name: str, country: str | None = None, http: httpx.Client | None = None) -> dict:
    """Returns {"entity": {...}} when unambiguous, {"candidates": [...]} when the buyer must pick, or {} when nothing is found."""
    found = search_gleif(name, country, http)
    wanted = core_name(name)
    exact = [c for c in found if core_name(c["legal_name"]) == wanted]
    if len(exact) == 1:
        return {"entity": exact[0]}
    if not found:
        return {}
    # Names that start with the query come first, funds and pension schemes last, shorter names before longer ones.
    def rank(c):
        core = core_name(c["legal_name"])
        return (c not in exact, not core.startswith(wanted), bool(re.search(r"pension|fund|trust", core)), len(core))
    return {"candidates": sorted(found, key=rank)[:5]}
