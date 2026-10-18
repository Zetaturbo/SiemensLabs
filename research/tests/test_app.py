from fastapi.testclient import TestClient

from research_service.app import app

client = TestClient(app)


def test_health_is_ok():
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert "research_company" in body["planned"]


def test_planned_tool_returns_not_implemented_envelope():
    res = client.post("/tools/research_company", json={"company_name": "Example Rail Components GmbH"})
    assert res.status_code == 404
    body = res.json()
    assert body["ok"] is False
    assert body["data"] is None
    assert "not implemented yet" in body["error"]["message"]


def test_unknown_tool_returns_unknown_tool_envelope():
    res = client.post("/tools/does_not_exist", json={})
    assert res.status_code == 404
    assert res.json()["error"]["message"] == "Unknown tool: does_not_exist"
