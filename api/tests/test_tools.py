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


def test_http_unknown_tool():
    res = client.post("/tools/nope", json={})
    assert res.status_code == 404 and res.json()["error"]["code"] == "INTERNAL"


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
    ("explain_supplier", {"id": "SUPP_99999"}, "UNKNOWN_SUPPLIER"),
    ("explain_supplier", {}, "INVALID_FILTER"),
    ("explain_supplier", {"id": "SUPP_00018", "profile_id": "cheapest"}, "UNKNOWN_PROFILE"),
    ("rank_with_profile", {"custom_weights": {"price": 1}}, "UNKNOWN_FIELD"),
    ("rank_with_profile", {"custom_weights": {"quality_risk": -1}}, "INVALID_FILTER"),
    ("rank_with_profile", {"custom_weights": {"quality_risk": 0}}, "INVALID_FILTER"),
    ("rank_with_profile", {"ids": ["SUPP_00012", "SUPP_99999"]}, "UNKNOWN_SUPPLIER"),
    ("find_similar", {"id": "SUPP_00450", "must_be_lower": ["delivery_rating"]}, "UNKNOWN_FIELD"),
    ("kraljic_position", {"ids": ["SUPP_99999"]}, "UNKNOWN_SUPPLIER"),
    ("get_dataset_stats", {"fields": ["sourcing_risk_level"]}, "UNKNOWN_FIELD"),
    ("run_sql", {"query": "delete from suppliers"}, "QUERY_REJECTED"),
    ("run_sql", {"query": "select 1; drop table suppliers"}, "QUERY_REJECTED"),
    ("run_sql", {"query": "select * from public.suppliers"}, "QUERY_REJECTED"),
    ("run_sql", {"query": "select * from public.supplier_scores"}, "QUERY_REJECTED"),
    ("run_sql", {"query": "select pg_read_file('/etc/passwd')"}, "QUERY_REJECTED"),
    ("run_sql", {"query": "with x as (delete from chat.suppliers returning 1) select * from x"}, "QUERY_REJECTED"),
    ("run_sql", {"query": "select no_such_column from suppliers"}, "QUERY_REJECTED"),
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


def test_run_sql_caps_rows_and_ignores_trailing_comment():
    got = call("run_sql", {"query": "select supplier_id, po_volume_eur from suppliers order by supplier_id -- all"})
    assert got["ok"] and got["meta"] == {"row_count": 200, "truncated": True}
    assert got["data"]["columns"] == ["supplier_id", "po_volume_eur"]
    assert got["data"]["rows"][0] == ["SUPP_00001", 129814.45]


def test_rank_custom_weights_are_normalized():
    a = call("rank_with_profile", {"ids": ["SUPP_00012", "SUPP_00450", "SUPP_00731"],
                                   "custom_weights": {"quality_risk": 2, "delivery_risk": 2}})
    b = call("rank_with_profile", {"ids": ["SUPP_00012", "SUPP_00450", "SUPP_00731"],
                                   "custom_weights": {"quality_risk": 0.5, "delivery_risk": 0.5}})
    assert a["ok"] and a["data"]["profile_id"] == "custom"
    assert a["data"]["weights"] == {"delivery_risk": 0.5, "quality_risk": 0.5}
    assert a["data"]["ranking"] == b["data"]["ranking"]


def test_explain_default_profile_score_rounds_to_total_risk_index():
    got = call("explain_supplier", {"id": "SUPP_01825"})["data"]
    assert round(got["profile_score"]) == got["total_risk_index"] == 57


def test_find_similar_respects_conditions():
    got = call("find_similar", {"id": "SUPP_00450", "limit": 3,
                                "conditions": [{"field": "total_risk_index_level", "op": "eq", "value": "Low"}]})
    assert got["ok"] and 0 < len(got["data"]["similar"]) <= 3
    ids = [s["supplier_id"] for s in got["data"]["similar"]]
    rows = call("get_suppliers", {"ids": ids, "fields": ["total_risk_index_level"]})["data"]["suppliers"]
    assert {r["total_risk_index_level"] for r in rows} == {"Low"}


def test_kraljic_without_ids_returns_counts_only():
    got = call("kraljic_position", {"ids": None})
    assert got["data"]["suppliers"] == [] and sum(got["data"]["quadrant_counts"].values()) == 10_000


def test_dataset_stats_with_conditions():
    got = call("get_dataset_stats", {"fields": ["total_risk_index", "delivery_rating"],
                                     "conditions": [{"field": "total_risk_index_level", "op": "eq", "value": "Low"}]})
    tri, delivery = got["data"]["stats"]
    assert tri["count"] == 318 and tri["max"] <= 24
    assert tri["level_counts"] == {"Low": 318, "Medium": 0, "High": 0, "Critical": 0}
    assert delivery["level_counts"] is None
