"""Supplier data tools (ARCHITECTURE.md section 5). Each takes a connection and the JSON input and
returns the response envelope. All supplier data comes from the supplier_wide view.

Computation rules match frontend/scripts/gen-mocks.py and frontend/src/lib/data-api/mocks/README.md.
"""

from fractions import Fraction

from psycopg import sql

from .catalog import (
    CATEGORIES, DERIVED, FAMILIES, FAMILY_OF, LEVEL_BANDS, LEVELS, METRICS, NUMERIC_FIELDS, OFFICIAL_WEIGHTS,
    PROFILE_BY_ID, PROFILES, SCORE_FIELDS, SCORES, SOURCE_FIELDS, field_direction,
)
from .envelope import ToolError, num, ok, record
from .filters import check_fields, columns, order_clause, where_clause

MAX_COMPARE = 20
MAX_LIMIT = 1000
COMPARE_FIELDS = ["total_risk_index", *SCORE_FIELDS, *METRICS]


# --------------------------------------------------------------------------------------------------
# Input helpers
# --------------------------------------------------------------------------------------------------


def _ids(inp: dict, key: str = "ids") -> list[str]:
    ids = inp.get(key)
    if not isinstance(ids, list) or not ids or not all(isinstance(i, str) for i in ids):
        raise ToolError("INVALID_FILTER", f"{key} must be a non-empty list of supplier ids")
    return ids


def _int(inp: dict, key: str, default: int, lo: int, hi: int) -> int:
    v = inp.get(key)
    if v is None:
        return default
    if isinstance(v, bool) or not isinstance(v, int) or not lo <= v <= hi:
        raise ToolError("INVALID_FILTER", f"{key} must be an integer from {lo} to {hi}")
    return v


def _profile(inp: dict) -> str:
    pid = inp.get("profile_id") or "default"
    if pid not in PROFILE_BY_ID:
        raise ToolError("UNKNOWN_PROFILE", f"Unknown profile: {pid}; use one of {list(PROFILE_BY_ID)}")
    return pid


def _rows_by_id(conn, ids: list[str], fields) -> dict[str, dict]:
    """Fetch suppliers by id; raise UNKNOWN_SUPPLIER naming every id that does not exist."""
    query = sql.SQL("select {} from supplier_wide where supplier_id = any(%s)").format(columns(fields))
    rows = {r["supplier_id"]: r for r in conn.execute(query, [ids]).fetchall()}
    missing = [i for i in ids if i not in rows]
    if missing:
        raise ToolError("UNKNOWN_SUPPLIER", f"{', '.join(missing)} does not exist" if len(missing) == 1
                        else f"These suppliers do not exist: {', '.join(missing)}")
    return rows


def _profile_score(row: dict, weights: dict) -> float:
    # Rounded to 9 decimals so float noise never breaks the supplier_id tie-break
    return round(sum(float(row[f]) * w for f, w in weights.items()), 9)


# --------------------------------------------------------------------------------------------------
# Tools
# --------------------------------------------------------------------------------------------------

_metadata_cache: dict | None = None


def _weights_check(conn) -> dict:
    """Verify TRI == round_half_even(sum(official_weight * sub_score)) on every row, exactly."""
    rows = conn.execute(
        sql.SQL("select total_risk_index, {} from supplier_wide").format(columns(SCORE_FIELDS))
    ).fetchall()
    wf = {f: Fraction(round(OFFICIAL_WEIGHTS[f] * 100), 100) for f in SCORE_FIELDS}
    exact, sq_err = 0, 0.0
    for r in rows:
        total = sum(wf[f] * r[f] for f in SCORE_FIELDS)
        exact += round(total) == r["total_risk_index"]
        sq_err += (float(total) - r["total_risk_index"]) ** 2
    return {
        "method": "exact recomputation from the database with rational arithmetic",
        "rmse_official_weights": num((sq_err / len(rows)) ** 0.5, 4),
        "exact_rule": "total_risk_index = round_half_even(sum(official_weight * sub_score))",
        "rows_matching_exact_rule": exact,
        "rows": len(rows),
    }


def get_metadata(conn, inp: dict) -> dict:
    """Field descriptions, direction, family, official weight, level bands. Cached per process."""
    global _metadata_cache
    if _metadata_cache is not None:
        return _metadata_cache

    desc = {r["metric_key"]: r["description"]
            for r in conn.execute("select metric_key, description from metric_definitions").fetchall()}
    stats = conn.execute(
        "select count(*) as n, min(order_change_rate) as lo, max(order_change_rate) as hi from supplier_wide"
    ).fetchone()
    lo, hi = num(stats["lo"]), num(stats["hi"])

    def entry(field, label, description, type_, direction=None, family=None, official_weight=None, unit=None,
              source_column=None, level_field=None, values=None, formula=None):
        return {
            "field": field, "label": label, "description": description, "type": type_, "direction": direction,
            "family": family, "official_weight": official_weight, "unit": unit, "source_column": source_column,
            "level_field": level_field, "values": values, "formula": formula,
        }

    fields = [
        entry("supplier_id", "Supplier ID", "Unique supplier identifier, e.g. SUPP_00018.", "id",
              source_column="supplierID"),
        entry("supplier_name", "Supplier Name", "Synthetic supplier name. Cannot be researched on the web.", "text",
              source_column="Supplier Name"),
        entry("total_risk_index", "Total Risk Index", desc["Total_Risk_Index"], "index", "higher_is_worse",
              unit="score", source_column="Total_Risk_Index", level_field="total_risk_index_level",
              formula="round_half_even(sum(official_weight * sub_score)) over the 18 sub-scores"),
    ]
    for f, (col, label) in SCORES.items():
        fields.append(entry(f, label, desc[col], "score", "higher_is_worse", FAMILY_OF[f], OFFICIAL_WEIGHTS[f],
                            "score", col, f"{f}_level"))
    for f, (col, label, direction, unit) in METRICS.items():
        fields.append(entry(f, label, desc[col], "metric", direction, FAMILY_OF.get(f), unit=unit, source_column=col))
    for f, (col, label, values) in CATEGORIES.items():
        fields.append(entry(f, label, desc[col], "category", "higher_is_worse", FAMILY_OF[f], source_column=col,
                            values=values))
    labels = {"total_risk_index": "Total Risk Index", **{f: lab for f, (_, lab) in SCORES.items()}}
    for f in ["total_risk_index", *SCORE_FIELDS]:
        col = "Total_Risk_Index_Level" if f == "total_risk_index" else f"{SCORES[f][0]}_Level"
        fields.append(entry(
            f"{f}_level", f"{labels[f]} Level",
            f"Level band of {labels[f]}: Low 0-24, Medium 25-49, High 50-74, Critical 75-100.",
            "level", "higher_is_worse", FAMILY_OF.get(f), source_column=col, values=LEVELS))
    fields += [
        entry("delivery_risk", "Delivery Risk", "Derived for profile weights: 100 minus the delivery rating.",
              "derived", "higher_is_worse", FAMILY_OF["delivery_risk"], unit="score", formula="100 - delivery_rating"),
        entry("confirmation_risk", "Confirmation Risk",
              "Derived for profile weights: 100 minus the order confirmation rate.",
              "derived", "higher_is_worse", FAMILY_OF["confirmation_risk"], unit="score",
              formula="100 - order_confirmation_rate"),
        entry("change_risk", "Change Risk",
              "Derived for profile weights: order change rate min-max rescaled to 0-100 over the dataset.",
              "derived", "higher_is_worse", FAMILY_OF["change_risk"], unit="score",
              formula=f"100 * (order_change_rate - {lo}) / ({hi} - {lo})"),
    ]
    families = [
        {"family": fam, "label": label, "description": d, "score_fields": members,
         "official_weight": num(sum(OFFICIAL_WEIGHTS[m] for m in members), 4)}
        for fam, (label, d, members) in FAMILIES.items()
    ]
    data = {
        "fields": fields,
        "level_bands": LEVEL_BANDS,
        "families": families,
        "default_profile_id": "default",
        "dataset_rows": stats["n"],
        "official_weights_check": _weights_check(conn),
    }
    _metadata_cache = ok(data, row_count=len(fields), truncated=False)
    return _metadata_cache


def _family_weights(weights: dict) -> dict:
    out = {fam: 0.0 for fam in FAMILIES}
    for f, w in weights.items():
        out[FAMILY_OF[f]] += w
    return {k: num(v, 4) for k, v in out.items()}


def list_profiles(conn, inp: dict) -> dict:
    profiles = []
    for p in PROFILES:
        weights = dict(sorted(p["weights"].items(), key=lambda kv: (-kv[1], kv[0])))
        profiles.append({
            "profile_id": p["profile_id"], "label": p["label"], "description": p["description"],
            "weights": {k: num(v, 4) for k, v in weights.items()},
            "family_weights": _family_weights(p["weights"]),
        })
    return ok({"profiles": profiles}, row_count=len(profiles), truncated=False)


def get_suppliers(conn, inp: dict) -> dict:
    """Rows for the given ids, in input order. fields defaults to all 46 source fields."""
    ids = _ids(inp)
    if len(ids) > MAX_LIMIT:
        raise ToolError("TOO_MANY_SUPPLIERS", f"At most {MAX_LIMIT} ids per call")
    fields = check_fields(inp["fields"]) if inp.get("fields") else SOURCE_FIELDS
    if "supplier_id" not in fields:
        fields = ["supplier_id", *fields]
    by_id = _rows_by_id(conn, ids, fields)
    rows = [record(by_id[i], fields) for i in ids]
    return ok({"suppliers": rows}, row_count=len(rows), truncated=False)


def filter_suppliers(conn, inp: dict) -> dict:
    """Suppliers matching all conditions, sorted, paged, with the total match count."""
    where, params = where_clause(inp.get("conditions"))
    order = order_clause(inp.get("sort_by"))
    limit = _int(inp, "limit", 50, 1, MAX_LIMIT)
    offset = _int(inp, "offset", 0, 0, 10**9)
    fields = check_fields(inp["fields"]) if inp.get("fields") else SOURCE_FIELDS
    if "supplier_id" not in fields:
        fields = ["supplier_id", *fields]

    total = conn.execute(sql.SQL("select count(*) as n from supplier_wide {}").format(where), params).fetchone()["n"]
    query = sql.SQL("select {} from supplier_wide {} {} limit %s offset %s").format(columns(fields), where, order)
    rows = [record(r, fields) for r in conn.execute(query, [*params, limit, offset]).fetchall()]
    return ok({"total_matching": total, "suppliers": rows},
              row_count=len(rows), truncated=total > offset + len(rows))


def compare_suppliers(conn, inp: dict) -> dict:
    """Side by side rows, best and worst per field, family scores, and the largest differences."""
    ids = _ids(inp)
    if len(ids) > MAX_COMPARE:
        raise ToolError("TOO_MANY_SUPPLIERS", f"Compare at most {MAX_COMPARE} suppliers, got {len(ids)}")
    pid = _profile(inp)
    weights = PROFILE_BY_ID[pid]["weights"]
    fields = check_fields(inp["fields"], NUMERIC_FIELDS) if inp.get("fields") else COMPARE_FIELDS

    level_fields = [f"{f}_level" for f in fields if f"{f}_level" in SOURCE_FIELDS]
    needed = list(dict.fromkeys(
        ["supplier_id", "supplier_name", *fields, *level_fields, *CATEGORIES, *SCORE_FIELDS, *weights]))
    rows = _rows_by_id(conn, ids, needed)

    suppliers = []
    for i in ids:
        r = rows[i]
        rec = record(r, ["supplier_id", "supplier_name", *fields])
        for f in fields:
            if f"{f}_level" in r:
                rec[f"{f}_level"] = r[f"{f}_level"]
        rec.update(record(r, list(CATEGORIES)))
        rec["profile_score"] = num(_profile_score(r, weights))
        suppliers.append(rec)

    per_field = []
    for f in fields:
        vals = [(i, float(rows[i][f])) for i in ids]  # input order is the tie-break
        direction = field_direction(f)
        spread = max(v for _, v in vals) - min(v for _, v in vals)
        best = worst = None
        if direction in ("higher_is_worse", "higher_is_better") and spread > 0:
            lo = min(vals, key=lambda t: t[1])[0]
            hi = max(vals, key=lambda t: t[1])[0]
            best, worst = (lo, hi) if direction == "higher_is_worse" else (hi, lo)
        per_field.append({"field": f, "direction": direction, "best": best, "worst": worst, "spread": num(spread)})

    family_scores = []
    for i in ids:
        entry = {"supplier_id": i}
        for fam, (_, _, members) in FAMILIES.items():
            tw = sum(OFFICIAL_WEIGHTS[m] for m in members)
            entry[fam] = num(sum(OFFICIAL_WEIGHTS[m] * rows[i][m] for m in members) / tw)
        family_scores.append(entry)

    spreads = {p["field"]: p["spread"] for p in per_field if p["field"] in SCORE_FIELDS}
    largest = sorted(spreads, key=lambda f: (-spreads[f], -OFFICIAL_WEIGHTS[f], SCORE_FIELDS.index(f)))[:3]
    data = {"suppliers": suppliers, "per_field": per_field, "family_scores": family_scores,
            "largest_differences": largest}
    return ok(data, row_count=len(suppliers), truncated=False, profile_id=pid)


TOOLS = {
    "get_metadata": get_metadata,
    "list_profiles": list_profiles,
    "get_suppliers": get_suppliers,
    "filter_suppliers": filter_suppliers,
    "compare_suppliers": compare_suppliers,
}

# Contract tools not built yet; the HTTP route answers 404 with an INTERNAL error for them
PLANNED_TOOLS = ["rank_with_profile", "explain_supplier", "find_similar", "kraljic_position",
                 "get_dataset_stats", "run_sql"]
