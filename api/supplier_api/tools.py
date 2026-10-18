"""Supplier data tools (ARCHITECTURE.md section 5). Each takes a connection and the JSON input and
returns the response envelope. All supplier data comes from the supplier_wide view.

Computation rules match frontend/scripts/gen-mocks.py and frontend/src/lib/data-api/mocks/README.md.
"""

import re
from decimal import Decimal
from fractions import Fraction

import psycopg
from psycopg import sql

from .catalog import (
    CATEGORIES, DERIVED, FAMILIES, FAMILY_OF, LEVEL_BANDS, LEVELS, METRICS, NUMERIC_FIELDS, OFFICIAL_WEIGHTS,
    PROFILE_BY_ID, PROFILES, SCORE_FIELDS, SCORES, SOURCE_FIELDS, field_direction,
)
from .db import reader_pool
from .envelope import ToolError, num, ok, record
from .filters import check_fields, columns, order_clause, where_clause

MAX_COMPARE = 20
MAX_LIMIT = 1000
MAX_SQL_ROWS = 200
# Fields where "lower" means less risk, usable in find_similar.must_be_lower
LOWER_IS_BETTER = ["total_risk_index", *SCORE_FIELDS, "order_change_rate", *DERIVED]
SUPPLY_RISK_HIGH = ["High"]  # Team lead decision: Medium sourcing risk counts as low supply risk
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




def _weights(inp: dict) -> tuple[str, dict]:
    """Resolve profile_id or custom_weights to (profile_id, weights). Custom weights are normalized to
    sum to 1 so profile_score stays on the 0-100 scale."""
    custom = inp.get("custom_weights")
    if custom is None:
        pid = _profile(inp)
        return pid, PROFILE_BY_ID[pid]["weights"]
    if not isinstance(custom, dict) or not custom:
        raise ToolError("INVALID_FILTER", "custom_weights must be an object of field -> weight")
    unknown = [f for f in custom if f not in SCORE_FIELDS and f not in DERIVED]
    if unknown:
        raise ToolError("UNKNOWN_FIELD", f"Cannot weight {', '.join(unknown)}; use risk scores or {DERIVED}")
    if any(isinstance(w, bool) or not isinstance(w, (int, float)) or w < 0 for w in custom.values()):
        raise ToolError("INVALID_FILTER", "custom_weights values must be non-negative numbers")
    total = sum(custom.values())
    if total <= 0:
        raise ToolError("INVALID_FILTER", "custom_weights must have at least one positive weight")
    return "custom", {f: w / total for f, w in custom.items() if w > 0}


def _candidates(conn, inp: dict, fields) -> list[dict]:
    """Rows for inp.ids if given, otherwise every supplier matching inp.conditions."""
    if inp.get("ids") is not None:
        ids = list(dict.fromkeys(_ids(inp)))
        rows = _rows_by_id(conn, ids, fields)
        return [rows[i] for i in ids]
    where, params = where_clause(inp.get("conditions"))
    query = sql.SQL("select {} from supplier_wide {}").format(columns(fields), where)
    return conn.execute(query, params).fetchall()


def rank_with_profile(conn, inp: dict) -> dict:
    """Rank candidates by profile_score (lower is better) and show the move against the default ranking."""
    pid, weights = _weights(inp)
    limit = _int(inp, "limit", 20, 1, MAX_LIMIT)
    fields = list(dict.fromkeys(["supplier_id", "supplier_name", "total_risk_index", *weights, *OFFICIAL_WEIGHTS]))
    cand = _candidates(conn, inp, fields)

    score = {r["supplier_id"]: _profile_score(r, weights) for r in cand}
    default = {r["supplier_id"]: _profile_score(r, OFFICIAL_WEIGHTS) for r in cand}
    order = sorted(cand, key=lambda r: (score[r["supplier_id"]], r["supplier_id"]))
    default_rank = {sid: i + 1 for i, sid in enumerate(sorted(default, key=lambda s: (default[s], s)))}

    ranking = []
    for i, r in enumerate(order[:limit]):
        sid = r["supplier_id"]
        contrib = sorted(((f, w * float(r[f])) for f, w in weights.items() if w * float(r[f]) > 0),
                         key=lambda t: (-t[1], t[0]))[:3]
        ranking.append({
            "rank": i + 1,
            "supplier_id": sid,
            "supplier_name": r["supplier_name"],
            "profile_score": num(score[sid]),
            "total_risk_index": num(r["total_risk_index"]),
            "default_rank": default_rank[sid],
            "rank_change": default_rank[sid] - (i + 1),
            "top_contributors": [{"field": f, "value": num(r[f]), "contribution": num(c)} for f, c in contrib],
        })
    data = {
        "profile_id": pid,
        "weights": {k: num(v, 4) for k, v in sorted(weights.items(), key=lambda kv: (-kv[1], kv[0]))},
        "total_matching": len(cand),
        "ranking": ranking,
    }
    return ok(data, row_count=len(ranking), truncated=len(cand) > len(ranking), profile_id=pid)


def explain_supplier(conn, inp: dict) -> dict:
    """Each weighted field with its percentile and contribution vs the dataset mean, largest first."""
    sid = inp.get("id")
    if not isinstance(sid, str):
        raise ToolError("INVALID_FILTER", "id must be a supplier id")
    pid, weights = _weights(inp)
    fields = list(dict.fromkeys([
        "supplier_id", "supplier_name", "total_risk_index", "total_risk_index_level",
        *SCORE_FIELDS, *[f"{f}_level" for f in SCORE_FIELDS], *weights,
        "delivery_rating", "order_confirmation_rate", "order_change_rate", *CATEGORIES, "po_volume_eur",
    ]))
    row = _rows_by_id(conn, [sid], fields)[sid]

    # Dataset mean and percentile (share of suppliers strictly lower, in percent) per field, in one pass
    stat_fields = list(dict.fromkeys(["total_risk_index", *weights]))
    aggs = [
        sql.SQL("avg({f})::float8 as {m}, (100.0 * count(*) filter (where {f} < %s) / count(*))::float8 as {p}")
        .format(f=sql.Identifier(f), m=sql.Identifier(f"mean_{f}"), p=sql.Identifier(f"pct_{f}"))
        for f in stat_fields
    ]
    stats = conn.execute(sql.SQL("select {} from supplier_wide").format(sql.SQL(", ").join(aggs)),
                         [row[f] for f in stat_fields]).fetchone()

    contributions = []
    for f, w in weights.items():
        mean = stats[f"mean_{f}"]
        contributions.append({
            "field": f,
            "value": num(row[f]),
            "level": row[f"{f}_level"] if f in SCORE_FIELDS else None,
            "weight": num(w, 4),
            "percentile": num(stats[f"pct_{f}"]),
            "dataset_mean": num(mean),
            "contribution_vs_mean": w * (float(row[f]) - mean),
        })
    contributions.sort(key=lambda c: (-c["contribution_vs_mean"], c["field"]))
    for c in contributions:
        c["contribution_vs_mean"] = num(c["contribution_vs_mean"])
    # Critical fields over all 18 scores, in contribution order, then by official weight
    pos = {c["field"]: i for i, c in enumerate(contributions)}
    crit = [f for f in SCORE_FIELDS if row[f"{f}_level"] == "Critical"]
    crit.sort(key=lambda f: (pos.get(f, len(pos)), -OFFICIAL_WEIGHTS[f], f))
    data = {
        "supplier_id": sid,
        "supplier_name": row["supplier_name"],
        "profile_id": pid,
        "total_risk_index": num(row["total_risk_index"]),
        "total_risk_level": row["total_risk_index_level"],
        "percentile": num(stats["pct_total_risk_index"]),
        "dataset_mean": num(stats["mean_total_risk_index"]),
        "profile_score": num(_profile_score(row, weights)),
        "contributions": contributions,
        "critical_fields": crit,
        "operational_metrics": {
            "delivery_rating": num(row["delivery_rating"]),
            "order_confirmation_rate": num(row["order_confirmation_rate"]),
            "order_change_rate": num(row["order_change_rate"]),
        },
        "context": {
            "po_volume_eur": num(row["po_volume_eur"]),
            "sourcing_risk_level": row["sourcing_risk_level"],
            "supply_chain_complexity": row["supply_chain_complexity"],
        },
    }
    return ok(data, row_count=1, truncated=False, profile_id=pid)


def find_similar(conn, inp: dict) -> dict:
    """Nearest suppliers by Euclidean distance on the 18 risk scores, optionally strictly lower on some fields."""
    sid = inp.get("id")
    if not isinstance(sid, str):
        raise ToolError("INVALID_FILTER", "id must be a supplier id")
    must = inp.get("must_be_lower") or []
    check_fields(must, LOWER_IS_BETTER)
    limit = _int(inp, "limit", 5, 1, 100)
    ref = _rows_by_id(conn, [sid], list(dict.fromkeys(["supplier_id", "total_risk_index", *SCORE_FIELDS, *must])))[sid]

    extra = [(sql.SQL("supplier_id <> %s"), [sid])]
    extra += [(sql.SQL("{} < %s").format(sql.Identifier(f)), [ref[f]]) for f in must]
    where, params = where_clause(inp.get("conditions"), extra)
    distance = sql.SQL("sqrt({})").format(sql.SQL(" + ").join(
        sql.SQL("power({} - %s, 2)").format(sql.Identifier(f)) for f in SCORE_FIELDS))
    query = sql.SQL(
        "select {cols}, {dist} as distance, count(*) over () as total from supplier_wide {where} "
        "order by distance, supplier_id limit %s"
    ).format(cols=columns(list(dict.fromkeys(["supplier_id", "supplier_name", "total_risk_index", *must]))),
             dist=distance, where=where)
    rows = conn.execute(query, [*[ref[f] for f in SCORE_FIELDS], *params, limit]).fetchall()

    total = rows[0]["total"] if rows else 0
    similar = [{
        "supplier_id": r["supplier_id"],
        "supplier_name": r["supplier_name"],
        "distance": num(r["distance"]),
        "total_risk_index": num(r["total_risk_index"]),
        "differences": {f: num(r[f] - ref[f]) for f in must},
    } for r in rows]
    data = {
        "reference": sid,
        "reference_values": {"total_risk_index": num(ref["total_risk_index"]), **{f: num(ref[f]) for f in must}},
        "total_matching": total,
        "similar": similar,
    }
    return ok(data, row_count=len(similar), truncated=total > len(similar))


def _quadrant(spend_high: bool, risk_high: bool) -> str:
    if spend_high:
        return "strategic" if risk_high else "leverage"
    return "bottleneck" if risk_high else "non_critical"


def kraljic_position(conn, inp: dict) -> dict:
    """Kraljic quadrant per supplier: spend is high from the 75th percentile of PO volume, supply risk is
    high when sourcing_risk_level is High. ids null returns the dataset counts only."""
    ids = _ids(inp) if inp.get("ids") is not None else None
    threshold = conn.execute(
        "select percentile_cont(0.75) within group (order by po_volume_eur) as t from supplier_wide"
    ).fetchone()["t"]
    counts = conn.execute(
        """
        select
            count(*) filter (where po_volume_eur >= %(t)s and sourcing_risk_level = any(%(h)s)) as strategic,
            count(*) filter (where po_volume_eur >= %(t)s and not sourcing_risk_level = any(%(h)s)) as leverage,
            count(*) filter (where po_volume_eur < %(t)s and sourcing_risk_level = any(%(h)s)) as bottleneck,
            count(*) filter (where po_volume_eur < %(t)s and not sourcing_risk_level = any(%(h)s)) as non_critical
        from supplier_wide
        """,
        {"t": threshold, "h": SUPPLY_RISK_HIGH},
    ).fetchone()

    suppliers = []
    if ids:
        rows = _rows_by_id(conn, ids, ["supplier_id", "supplier_name", "po_volume_eur", "sourcing_risk_level"])
        for i in ids:
            r = rows[i]
            sh, rh = float(r["po_volume_eur"]) >= threshold, r["sourcing_risk_level"] in SUPPLY_RISK_HIGH
            suppliers.append({
                "supplier_id": i,
                "supplier_name": r["supplier_name"],
                "po_volume_eur": num(r["po_volume_eur"]),
                "sourcing_risk_level": r["sourcing_risk_level"],
                "spend_high": sh,
                "supply_risk_high": rh,
                "quadrant": _quadrant(sh, rh),
            })
    data = {
        "thresholds": {"po_volume_eur_high": num(threshold), "po_volume_eur_percentile": 75,
                       "supply_risk_high_levels": SUPPLY_RISK_HIGH},
        "quadrant_counts": dict(counts),
        "suppliers": suppliers,
    }
    return ok(data, row_count=len(suppliers), truncated=False)


def get_dataset_stats(conn, inp: dict) -> dict:
    """Count, mean, sample std, quartiles (linear interpolation), min, max and level counts per field."""
    fields = check_fields(inp["fields"], NUMERIC_FIELDS) if inp.get("fields") else ["total_risk_index"]
    where, params = where_clause(inp.get("conditions"))
    stats = []
    for f in fields:
        col = sql.Identifier(f)
        level = f"{f}_level"
        level_aggs = sql.SQL("").join(
            sql.SQL(", count(*) filter (where {} = {}) as {}").format(
                sql.Identifier(level), sql.Literal(lv), sql.Identifier(f"level_{lv}"))
            for lv in LEVELS
        ) if level in SOURCE_FIELDS else sql.SQL("")
        r = conn.execute(sql.SQL(
            "select count({c}) as count, avg({c}) as mean, stddev_samp({c}) as std, "
            "percentile_cont(array[0.25, 0.5, 0.75]) within group (order by {c}) as q, "
            "min({c}) as min, max({c}) as max{levels} from supplier_wide {where}"
        ).format(c=col, levels=level_aggs, where=where), params).fetchone()
        q = r["q"] or [None, None, None]
        stats.append({
            "field": f, "count": r["count"], "mean": num(r["mean"]), "std": num(r["std"]),
            "p25": num(q[0]), "median": num(q[1]), "p75": num(q[2]), "min": num(r["min"]), "max": num(r["max"]),
            "level_counts": {lv: r[f"level_{lv}"] for lv in LEVELS} if level in SOURCE_FIELDS else None,
        })
    return ok({"stats": stats}, row_count=len(stats), truncated=False)


def _cell(v):
    if v is None or isinstance(v, (str, bool, int, float)):
        return v
    if isinstance(v, Decimal):
        return float(v)
    return str(v)


def run_sql(conn, inp: dict) -> dict:
    """Read-only fallback for the chatbot: one SELECT against the `suppliers` view (contract field names),
    run as the supplier_reader role, at most 200 rows. conn is unused; the query never runs as the owner."""
    query = inp.get("query")
    if not isinstance(query, str) or not query.strip():
        raise ToolError("QUERY_REJECTED", "query must be a non-empty SELECT statement")
    query = query.strip().rstrip(";").strip()
    if ";" in query:
        raise ToolError("QUERY_REJECTED", "Only one statement is allowed")
    if not re.match(r"(?is)^(select|with)\b", query):
        raise ToolError("QUERY_REJECTED", "Only SELECT queries are allowed")
    # The newline keeps a trailing -- comment from swallowing the limit
    wrapped = f"select * from (\n{query}\n) as q limit {MAX_SQL_ROWS + 1}"
    try:
        with reader_pool().connection(timeout=5) as rc:
            cur = rc.execute(wrapped)
            cols = [d.name for d in cur.description]
            rows = cur.fetchall()
    except psycopg.Error as e:
        message = e.diag.message_primary if e.diag and e.diag.message_primary else str(e)
        raise ToolError("QUERY_REJECTED", f"Query failed: {message}") from e
    truncated = len(rows) > MAX_SQL_ROWS
    rows = [[_cell(v) for v in r] for r in rows[:MAX_SQL_ROWS]]
    return ok({"columns": cols, "rows": rows}, row_count=len(rows), truncated=truncated)


TOOLS = {
    "get_metadata": get_metadata,
    "list_profiles": list_profiles,
    "get_suppliers": get_suppliers,
    "filter_suppliers": filter_suppliers,
    "rank_with_profile": rank_with_profile,
    "compare_suppliers": compare_suppliers,
    "explain_supplier": explain_supplier,
    "find_similar": find_similar,
    "kraljic_position": kraljic_position,
    "get_dataset_stats": get_dataset_stats,
    "run_sql": run_sql,
}
