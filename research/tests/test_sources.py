import json

import httpx
import pytest

from research_service.sources import SandboxAdapter, SourceNotAllowed, TavilyAdapter, host_matches

LANES = {"news": {"domains": ["reuters.com", "dw.com"]}, "company": {"domains": ["gleif.org"]}}


def tavily(handler, **kwargs) -> tuple[TavilyAdapter, list[dict]]:
    sent: list[dict] = []

    def wrapped(request: httpx.Request) -> httpx.Response:
        sent.append({"path": request.url.path, "body": json.loads(request.content)})
        return handler(request)

    http = httpx.Client(transport=httpx.MockTransport(wrapped))
    return TavilyAdapter("tvly-test", lanes=LANES, http=http, **kwargs), sent


def test_host_matches_domain_and_subdomain_only():
    assert host_matches("https://www.reuters.com/x", "reuters.com")
    assert host_matches("https://reuters.com/x", "reuters.com")
    assert not host_matches("https://evilreuters.com/x", "reuters.com")
    assert not host_matches("https://reuters.com.evil.io/x", "reuters.com")


def test_search_restricts_domains_and_drops_off_list_results():
    def handler(request):
        return httpx.Response(200, json={"results": [
            {"title": "Ok", "url": "https://www.reuters.com/a", "content": "c", "published_date": "2026-01-01"},
            {"title": "Leak", "url": "https://random-blog.example/b", "content": "c"},
        ]})

    adapter, sent = tavily(handler)
    hits = adapter.search("recall", "news")
    assert [h.url for h in hits] == ["https://www.reuters.com/a"]
    assert sent[0]["body"]["include_domains"] == ["reuters.com", "dw.com"]
    assert sent[0]["body"]["include_domains_mode"] == "restrict"


def test_fetch_refuses_off_list_url_without_calling_tavily():
    adapter, sent = tavily(lambda r: httpx.Response(200, json={}))
    with pytest.raises(SourceNotAllowed):
        adapter.fetch("https://random-blog.example/b", "news")
    assert sent == []


def test_fetch_returns_page_text():
    adapter, _ = tavily(lambda r: httpx.Response(200, json={"results": [{"url": "u", "raw_content": "page text"}]}))
    page = adapter.fetch("https://dw.com/story", "news")
    assert page.text == "page text"
    assert page.simulated is False


def test_failed_extraction_is_reported():
    adapter, _ = tavily(lambda r: httpx.Response(200, json={"results": [], "failed_results": [{"url": "u", "error": "blocked"}]}))
    with pytest.raises(SourceNotAllowed, match="blocked"):
        adapter.fetch("https://dw.com/story", "news")


def test_company_website_is_allowed_only_for_the_company_lane():
    adapter, _ = tavily(lambda r: httpx.Response(200, json={}), extra_domains={"company": ["example-rail.de"]})
    assert "example-rail.de" in adapter.allowed_domains("company")
    assert "example-rail.de" not in adapter.allowed_domains("news")


def test_unknown_lane_is_refused():
    adapter, _ = tavily(lambda r: httpx.Response(200, json={}))
    with pytest.raises(SourceNotAllowed):
        adapter.search("x", "social_media")


def test_sandbox_serves_only_its_own_documents(tmp_path):
    doc = {"lane": "news", "url": "https://sim.example/recall", "title": "Brake recall (simulated)",
           "publisher": "Sim Daily", "published": "2025-03-14", "text": "The company recalled one batch of brake components."}
    (tmp_path / "recall.json").write_text(json.dumps(doc), encoding="utf-8")
    adapter = SandboxAdapter(tmp_path)

    hits = adapter.search("brake recall", "news")
    assert [h.url for h in hits] == ["https://sim.example/recall"]
    assert adapter.search("brake recall", "legal") == []  # wrong lane

    page = adapter.fetch("https://sim.example/recall", "news")
    assert page.simulated is True and "recalled one batch" in page.text
    with pytest.raises(SourceNotAllowed):
        adapter.fetch("https://reuters.com/real-page", "news")


def test_search_can_narrow_to_a_subset_of_the_lane():
    adapter, sent = tavily(lambda r: httpx.Response(200, json={"results": []}))
    adapter.search("sanctions", "news", domains=["dw.com"])
    assert sent[0]["body"]["include_domains"] == ["dw.com"]


def test_search_refuses_a_domain_outside_the_lane():
    adapter, sent = tavily(lambda r: httpx.Response(200, json={"results": []}))
    with pytest.raises(SourceNotAllowed):
        adapter.search("x", "news", domains=["gleif.org"])  # allowed for company, not for news
    assert sent == []


def test_fetch_retries_with_advanced_extraction():
    depths = []

    def handler(request):
        depth = json.loads(request.content)["extract_depth"]
        depths.append(depth)
        if depth == "basic":
            return httpx.Response(200, json={"results": [], "failed_results": [{"url": "u", "error": "blocked"}]})
        return httpx.Response(200, json={"results": [{"url": "u", "raw_content": "full text"}]})

    adapter, _ = tavily(handler)
    assert adapter.fetch("https://dw.com/story", "news").text == "full text"
    assert depths == ["basic", "advanced"]
