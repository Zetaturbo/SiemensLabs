"""Tool tests against the live database (start it with db/docker-compose.yml and run db/ingest.py first).

The fixtures in tests/fixtures/mocks are the frontend's data-API mocks (frontend/src/lib/data-api/mocks on
the integration branch), computed from the CSV by frontend/scripts/gen-mocks.py. Each one echoes its
input in meta.mock_input, so every built tool must reproduce its mock exactly from Postgres.
"""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from supplier_api.app import app, run_tool
from supplier_api.tools import TOOLS

MOCKS = Path(__file__).parent / "fixtures" / "mocks"
client = TestClient(app)


def load_mock(tool: str) -> dict:
    return json.loads((MOCKS / f"{tool}.json").read_text())


def call(tool: str, inp: dict) -> dict:
    return run_tool(tool, inp)


@pytest.mark.parametrize("tool", sorted(TOOLS))
def test_matches_mock(tool):
    mock = load_mock(tool)
    inp = mock["meta"].pop("mock_input", {})
    got = call(tool, inp)
    if tool == "get_metadata":
        # The mock also reports a least-squares refit (numpy); the service checks the exact rule only
        check = got["data"].pop("official_weights_check")
        mock["data"].pop("official_weights_check")
        assert check["rows_matching_exact_rule"] == check["rows"] == 10_000
    assert got == mock


def test_http_route():
    res = client.post("/tools/get_suppliers", json={"ids": ["SUPP_00018"], "fields": ["total_risk_index"]})
    assert res.status_code == 200
    assert res.json()["data"]["suppliers"] == [{"supplier_id": "SUPP_00018", "total_risk_index": 80}]


def test_http_unknown_and_planned_tool():
    assert client.post("/tools/nope", json={}).status_code == 404
    res = client.post("/tools/explain_supplier", json={"id": "SUPP_00018"})
    assert res.status_code == 404 and "not implemented" in res.json()["error"]["message"]


def test_http_bad_body():
    res = client.post("/tools/get_suppliers", content="[1, 2]")
    assert res.status_code == 400 and res.json()["error"]["code"] == "INVALID_FILTER"


@pytest.mark.parametrize("tool, inp, code", [
    ("get_suppliers", {"ids": ["SUPP_00018", "SUPP_99999"]}, "UNKNOWN_SUPPLIER"),
    ("get_suppliers", {"ids": []}, "INVALID_FILTER"),
    ("get_suppliers", {"ids": ["SUPP_00018"], "fields": ["country"]}, "UNKNOWN_FIELD"),
    ("compare_suppliers", {"ids": [f"SUPP_{i:05d}" for i in range(1, 22)]}, "TOO_MANY_SUPPLIERS"),
    ("compare_suppliers", {"ids": ["SUPP_00012"], "profile_id": "cheapest"}, "UNKNOWN_PROFILE"),
    ("compare_suppliers", {"ids": ["SUPP_00012"], "fields": ["quality_risk_level"]}, "UNKNOWN_FIELD"),
    ("filter_suppliers", {"conditions": [{"field": "region", "op": "eq", "value": "EU"}]}, "UNKNOWN_FIELD"),
    ("filter_suppliers", {"conditions": [{"field": "quality_risk", "op": "like", "value": 5}]}, "INVALID_FILTER"),
    ("filter_suppliers", {"conditions": [{"field": "quality_risk", "op": "gt", "value": "high"}]}, "INVALID_FILTER"),
    ("filter_suppliers", {"conditions": [{"field": "quality_risk_level", "op": "eq", "value": "Severe"}]},
     "INVALID_FILTER"),
    ("filter_suppliers", {"conditions": [{"field": "supplier_name", "op": "gt", "value": "A"}]}, "INVALID_FILTER"),
    ("filter_suppliers", {"conditions": [{"field": "credit_rating", "op": "between", "value": [1]}]},
     "INVALID_FILTER"),
    ("filter_suppliers", {"limit": 0}, "INVALID_FILTER"),
    ("filter_suppliers", {"sort_by": [{"field": "credit_rating", "order": "up"}]}, "INVALID_FILTER"),
])
def test_errors(tool, inp, code):
    got = call(tool, inp)
    assert got["ok"] is False and got["data"] is None and got["error"]["code"] == code


def test_injection_is_rejected_as_unknown_field():
    got = call("filter_suppliers", {"sort_by": [{"field": "credit_rating; drop table suppliers"}]})
    assert got["error"]["code"] == "UNKNOWN_FIELD"


def count(conditions) -> int:
    got = call("filter_suppliers", {"conditions": conditions, "limit": 1})
    assert got["ok"], got["error"]
    return got["data"]["total_matching"]


def test_level_filters_use_ordinal_order():
    # Level counts for total_risk_index from get_dataset_stats: Low 318, Medium 4485, High 4813, Critical 384
    assert count([{"field": "total_risk_index_level", "op": "gte", "value": "High"}]) == 4813 + 384
    assert count([{"field": "total_risk_index_level", "op": "between", "value": ["Medium", "High"]}]) == 4485 + 4813
    assert count([{"field": "total_risk_index_level", "op": "in", "value": ["Low", "Critical"]}]) == 318 + 384
    assert count([{"field": "total_risk_index_level", "op": "not_in", "value": ["Low", "Critical"]}]) == 4485 + 4813


def test_numeric_and_derived_filters_agree():
    a = count([{"field": "delivery_rating", "op": "gte", "value": 90}])
    b = count([{"field": "delivery_risk", "op": "lte", "value": 10}])
    assert a == b > 0
    assert count([{"field": "total_risk_index", "op": "between", "value": [0, 24]}]) == 318


def test_sort_by_level_and_paging():
    base = {"conditions": [{"field": "credit_rating", "op": "lt", "value": 30}],
            "sort_by": [{"field": "sourcing_risk_level", "order": "desc"}, {"field": "credit_rating", "order": "asc"}],
            "fields": ["sourcing_risk_level", "credit_rating"], "limit": 5}
    first = call("filter_suppliers", base)["data"]["suppliers"]
    second = call("filter_suppliers", {**base, "offset": 5})["data"]["suppliers"]
    assert all(r["sourcing_risk_level"] == "High" for r in first)
    both = first + second
    assert [r["credit_rating"] for r in both] == sorted(r["credit_rating"] for r in both)
    assert len({r["supplier_id"] for r in both}) == 10
