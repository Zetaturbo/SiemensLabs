import httpx
import pytest

from research_service.llm import LLMClient, LLMError, parse_json


def client(statuses: dict[str, list[int]]) -> tuple[LLMClient, list[str]]:
    """Each model gets a queue of HTTP statuses; 200 answers with its own name."""
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        import json

        model = json.loads(request.content)["model"]
        calls.append(model)
        status = statuses[model].pop(0)
        if status == 200:
            return httpx.Response(200, json={"choices": [{"message": {"content": f"hi from {model}"}}]})
        return httpx.Response(status, json={"error": "x"})

    http = httpx.Client(transport=httpx.MockTransport(handler))
    return LLMClient("https://llm.example/v1", "key", http=http, retries=2, backoff=0), calls


def test_retries_rate_limit_then_succeeds():
    llm, calls = client({"a": [429, 429, 200]})
    model, msg = llm.chat(["a"], [{"role": "user", "content": "x"}])
    assert model == "a" and msg["content"] == "hi from a"
    assert calls == ["a", "a", "a"]


def test_falls_back_to_next_model_after_retries_run_out():
    llm, calls = client({"a": [429, 429, 429], "b": [200]})
    model, _ = llm.chat(["a", "b"], [{"role": "user", "content": "x"}])
    assert model == "b"
    assert calls == ["a", "a", "a", "b"]


def test_client_error_does_not_retry():
    llm, calls = client({"a": [404], "b": [200]})
    model, _ = llm.chat(["a", "b"], [])
    assert model == "b" and calls == ["a", "b"]


def test_raises_when_every_model_fails():
    llm, _ = client({"a": [500, 500, 500]})
    with pytest.raises(LLMError, match="all models failed"):
        llm.chat(["a"], [])


@pytest.mark.parametrize("text", [
    '{"a": 1}',
    '```json\n{"a": 1}\n```',
    '<think>reasoning {"a": 2}</think>\nHere you go: {"a": 1} thanks',
])
def test_parse_json_variants(text):
    assert parse_json(text) == {"a": 1}


def test_parse_json_without_json_raises():
    with pytest.raises(ValueError):
        parse_json("no json here")
