from fastapi.testclient import TestClient

from research_service.app import app

client = TestClient(app)


def test_health_lists_the_tools_and_config_without_secrets():
    body = client.get("/health").json()
    assert body["ok"] is True
    assert "research_company" in body["tools"] and body["planned"] == []
    assert "Fennic Railway Brakes GmbH" in body["simulated_companies"]
    assert "tvly" not in str(body) and "nvapi" not in str(body)


def test_unknown_tool_returns_unknown_tool_envelope():
    res = client.post("/tools/does_not_exist", json={})
    assert res.status_code == 404
    assert res.json()["error"]["message"] == "Unknown tool: does_not_exist"


def test_dataset_id_is_refused_over_http():
    body = client.post("/tools/research_company", json={"company_name": "BRK_0049"}).json()
    assert body["ok"] is False and body["error"]["code"] == "SYNTHETIC_ENTITY"


def test_bad_body_is_a_400():
    res = client.post("/tools/research_company", content=b"[1, 2]")
    assert res.status_code == 400 and res.json()["error"]["code"] == "INVALID_INPUT"
