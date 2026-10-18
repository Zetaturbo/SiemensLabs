"""Source adapters (docs/SPEC.md section 5). One interface, two implementations.

`TavilyAdapter` searches and fetches the live web, but only domains on the lane's closed list
(config/sources.json). The restriction is enforced twice: Tavily's `include_domains` filter on the request, and a
check of every returned and requested URL on our side. `SandboxAdapter` serves simulated documents for fictional demo
companies and can only return those documents, so it is closed by construction.
"""

import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Protocol
from urllib.parse import urlparse

import httpx

CONFIG = Path(__file__).resolve().parent.parent / "config" / "sources.json"


class SourceNotAllowed(Exception):
    """A search or fetch asked for a URL outside the lane's closed source list."""


@dataclass(frozen=True)
class Hit:
    title: str
    url: str
    snippet: str
    published: str | None = None


@dataclass(frozen=True)
class Page:
    url: str
    title: str
    text: str
    retrieved_at: str
    published: str | None = None
    publisher: str | None = None
    simulated: bool = False


class SourceAdapter(Protocol):
    def search(self, query: str, lane: str, max_results: int = 5, domains: list[str] | None = None) -> list[Hit]: ...

    def fetch(self, url: str, lane: str) -> Page: ...


def load_lanes(path: Path = CONFIG) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))["lanes"]


def host_matches(url: str, domain: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    domain = domain.lower()
    return host == domain or host.endswith("." + domain)


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class TavilyAdapter:
    BASE = "https://api.tavily.com"

    def __init__(self, api_key: str, lanes: dict | None = None, http: httpx.Client | None = None, extra_domains: dict[str, list[str]] | None = None):
        """`extra_domains` adds run-specific domains per lane, for example the resolved company website for `company`."""
        self.api_key = api_key
        self.lanes = lanes if lanes is not None else load_lanes()
        self.http = http or httpx.Client(timeout=90)
        self.extra_domains = extra_domains or {}

    def allowed_domains(self, lane: str) -> list[str]:
        if lane not in self.lanes:
            raise SourceNotAllowed(f"unknown lane: {lane}")
        return list(self.lanes[lane]["domains"]) + list(self.extra_domains.get(lane, []))

    def _allowed(self, url: str, lane: str) -> bool:
        return any(host_matches(url, d) for d in self.allowed_domains(lane))

    def _post(self, path: str, body: dict) -> dict:
        r = self.http.post(f"{self.BASE}/{path}", json=body, headers={"Authorization": f"Bearer {self.api_key}"})
        r.raise_for_status()
        return r.json()

    def search(self, query: str, lane: str, max_results: int = 5, domains: list[str] | None = None) -> list[Hit]:
        """`domains` narrows the search to part of the lane's list. A search over the whole lane returns results from only
        a few sites (Tavily check, 2026-10-18), so an agent that wants a sanctions list asks for that site."""
        allowed = self.allowed_domains(lane)
        if domains is not None:
            outside = [d for d in domains if not any(d == a or d.endswith("." + a) for a in allowed)]
            if outside:
                raise SourceNotAllowed(f"{outside} are not on the {lane} source list")
        data = self._post("search", {
            "query": query,
            "include_domains": domains or allowed,
            "include_domains_mode": "restrict",
            "max_results": max_results,
            "search_depth": "basic",
            "include_published_date": True,
        })
        return [
            Hit(r["title"], r["url"], r.get("content", ""), r.get("published_date"))
            for r in data.get("results", [])
            if self._allowed(r["url"], lane)
        ]

    def fetch(self, url: str, lane: str) -> Page:
        if not self._allowed(url, lane):
            raise SourceNotAllowed(f"{url} is not on the {lane} source list")
        # Some pages (apnews.com, ieeexplore.ieee.org) only extract at the advanced depth, which costs twice as much.
        for depth in ("basic", "advanced"):
            data = self._post("extract", {"urls": [url], "extract_depth": depth, "format": "markdown"})
            results = data.get("results", [])
            if results:
                break
        if not results:
            reason = (data.get("failed_results") or [{}])[0].get("error", "no content")
            raise SourceNotAllowed(f"could not extract {url}: {reason}")
        text = results[0]["raw_content"]
        return Page(url=url, title=url, text=text, retrieved_at=now_iso())


class SandboxAdapter:
    """Reads simulated documents from a folder of JSON files, one per document:
    {"lane", "url", "title", "publisher", "published", "text"}. Used for fictional companies only."""

    def __init__(self, folder: Path):
        self.docs = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(Path(folder).glob("*.json"))]

    def search(self, query: str, lane: str, max_results: int = 5, domains: list[str] | None = None) -> list[Hit]:
        words = set(re.findall(r"\w+", query.lower()))
        scored = []
        for d in self.docs:
            if d["lane"] != lane:
                continue
            haystack = set(re.findall(r"\w+", (d["title"] + " " + d["text"]).lower()))
            score = len(words & haystack)
            if score:
                scored.append((score, d))
        scored.sort(key=lambda x: -x[0])
        return [Hit(d["title"], d["url"], d["text"][:200], d.get("published")) for _, d in scored[:max_results]]

    def fetch(self, url: str, lane: str) -> Page:
        for d in self.docs:
            if d["url"] == url and d["lane"] == lane:
                return Page(url=url, title=d["title"], text=d["text"], retrieved_at=now_iso(),
                            published=d.get("published"), publisher=d.get("publisher"), simulated=True)
        raise SourceNotAllowed(f"{url} is not a sandbox document for the {lane} lane")
