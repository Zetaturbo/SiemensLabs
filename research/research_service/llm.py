"""Client for the OpenAI-compatible LLM endpoint the whole team uses (LLM_BASE_URL, LLM_API_KEY).

The endpoint is a free tier with rate limits, so a call retries on 429 and 5xx with backoff and then moves on to the
next model in `models` (for example the role's second candidate from config/models.json).
"""

import json
import os
import re
import time
from pathlib import Path

import httpx

RETRY_STATUS = {429, 500, 502, 503, 504}
MODELS_CONFIG = Path(__file__).resolve().parent.parent / "config" / "models.json"


class LLMError(Exception):
    pass


class LLMClient:
    def __init__(self, base_url: str, api_key: str, http: httpx.Client | None = None, retries: int = 2, backoff: float = 2.0):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.http = http or httpx.Client(timeout=120)
        self.retries = retries
        self.backoff = backoff

    def chat(self, models: list[str], messages: list[dict], **extra) -> tuple[str, dict]:
        """Returns (model that answered, assistant message). Tries each model in order."""
        errors = []
        for model in models:
            for attempt in range(self.retries + 1):
                body = {"model": model, "messages": messages, "temperature": 0, "max_tokens": 6000, **extra}
                try:
                    r = self.http.post(f"{self.base_url}/chat/completions", json=body, headers={"Authorization": f"Bearer {self.api_key}"})
                except httpx.HTTPError as e:
                    errors.append(f"{model}: {type(e).__name__}")
                    break
                if r.status_code == 200:
                    return model, r.json()["choices"][0]["message"]
                errors.append(f"{model}: HTTP {r.status_code}")
                if r.status_code not in RETRY_STATUS:
                    break
                if attempt < self.retries:
                    time.sleep(self.backoff * (2**attempt))
        raise LLMError("all models failed: " + "; ".join(errors))


def requires_json(*keys: str):
    """A validate function for FallbackChain.chat: a reply without tool calls must hold a JSON object with these keys."""

    def check(message: dict) -> None:
        if message.get("tool_calls"):
            return
        data = parse_json(message.get("content"))
        for key in keys:
            data[key]

    return check


def parse_json(text: str | None):
    """First JSON object or array in a model reply. Ignores <think> blocks and code fences."""
    text = re.sub(r"<think>.*?</think>", "", text or "", flags=re.S).strip()
    fenced = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    if fenced:
        text = fenced.group(1)
    starts = [i for i in (text.find("{"), text.find("[")) if i >= 0]
    if not starts:
        raise ValueError("no JSON in reply")
    obj, _ = json.JSONDecoder().raw_decode(text[min(starts):])
    return obj


class FallbackChain:
    """Tries (label, client, model) routes in order, for example the free nvidia tier first and the paid nebius account after it."""

    def __init__(self, routes: list[tuple[str, LLMClient, str]]):
        if not routes:
            raise LLMError("no model route is configured: set LLM_API_KEY or NEBIUS_API_KEY")
        self.routes = routes

    def chat(self, messages: list[dict], validate=None, **extra) -> tuple[str, dict]:
        """Returns (label of the route that answered, assistant message).

        `validate(message)` may raise ValueError, KeyError or TypeError for an unusable reply (empty, not JSON, wrong shape).
        The reply is then treated like a failure and the next route is tried. Reasoning models that run out of tokens
        before answering are the usual case.
        """
        errors = []
        for label, client, model in self.routes:
            try:
                _, message = client.chat([model], messages, **extra)
                if validate:
                    validate(message)
                return label, message
            except LLMError as e:
                errors.append(f"{label}: {e}")
            except (ValueError, KeyError, TypeError, AttributeError) as e:
                errors.append(f"{label}: unusable reply ({type(e).__name__})")
        raise LLMError("every route failed: " + " | ".join(errors))


def chain_for_role(role: str, env: dict | None = None, config_path: Path = MODELS_CONFIG) -> FallbackChain:
    """Builds the chain for an agent role from config/models.json, skipping providers whose key is not set."""
    env = os.environ if env is None else env
    cfg = json.loads(config_path.read_text(encoding="utf-8"))
    clients: dict[str, LLMClient] = {}
    for name, p in cfg["providers"].items():
        key = env.get(p["key_env"])
        if key:
            base = p.get("base_url") or env.get(p.get("base_url_env", ""), p.get("base_url_default", ""))
            clients[name] = LLMClient(base, key)
    routes = [(f"{c['provider']}:{c['model']}", clients[c["provider"]], c["model"])
              for c in cfg["roles"][role]["candidates"] if c["provider"] in clients]
    return FallbackChain(routes)
