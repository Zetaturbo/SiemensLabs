"""Client for the OpenAI-compatible LLM endpoint the whole team uses (LLM_BASE_URL, LLM_API_KEY).

The endpoint is a free tier with rate limits, so a call retries on 429 and 5xx with backoff and then moves on to the
next model in `models` (for example the role's second candidate from config/models.json).
"""

import json
import re
import time

import httpx

RETRY_STATUS = {429, 500, 502, 503, 504}


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
                body = {"model": model, "messages": messages, "temperature": 0, "max_tokens": 1200, **extra}
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
