"""Shared objects of the running service: settings, job store, model chains, source adapters, worker pool."""

import json
import threading
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlparse

from .config import ROOT, Settings, load_settings
from .entity import core_name
from .llm import chain_for_role
from .sources import SandboxAdapter, TavilyAdapter, load_lanes
from .store import JobStore

SANDBOX = ROOT / "sandbox"


def website_domain(website: str | None) -> str | None:
    if not website:
        return None
    host = urlparse(website if "//" in website else f"//{website}").hostname
    return host.removeprefix("www.") if host else None


class Sandbox:
    """Fictional demo companies with simulated documents (sandbox/registry.json)."""

    def __init__(self, folder: Path = SANDBOX):
        self.folder = folder
        path = folder / "registry.json"
        self.companies = json.loads(path.read_text(encoding="utf-8"))["companies"] if path.exists() else []

    def find(self, name: str) -> dict | None:
        wanted = core_name(name)
        return next((c for c in self.companies if core_name(c["name"]) == wanted), None)

    def adapter(self, entry: dict) -> SandboxAdapter:
        return SandboxAdapter(self.folder / entry["folder"])


@dataclass
class AppContext:
    settings: Settings
    store: JobStore
    executor: ThreadPoolExecutor
    sandbox: Sandbox
    lanes: dict
    chain_factory: object = None  # role -> chain with .chat(messages, **extra); built lazily from config/models.json
    live_adapter_factory: object = None  # (extra_domains) -> adapter; Tavily by default
    http: object = None
    _chains: dict = field(default_factory=dict)
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def chain(self, role: str):
        with self._lock:
            if role not in self._chains:
                self._chains[role] = (self.chain_factory or chain_for_role)(role)
            return self._chains[role]

    def live_adapter(self, extra_domains: dict[str, list[str]]):
        if self.live_adapter_factory:
            return self.live_adapter_factory(extra_domains)
        if not self.settings.tavily_api_key:
            raise RuntimeError("TAVILY_API_KEY is not set, so live research is unavailable")
        return TavilyAdapter(self.settings.tavily_api_key, lanes=self.lanes, extra_domains=extra_domains)


_context: AppContext | None = None
_context_lock = threading.Lock()


def build_context(settings: Settings | None = None) -> AppContext:
    settings = settings or load_settings()
    return AppContext(settings=settings, store=JobStore(settings.store_dir), executor=ThreadPoolExecutor(settings.max_concurrent_runs, thread_name_prefix="research"),
                      sandbox=Sandbox(), lanes=load_lanes())


def get_context() -> AppContext:
    global _context
    with _context_lock:
        if _context is None:
            _context = build_context()
        return _context


def set_context(ctx: AppContext | None) -> None:
    global _context
    _context = ctx
