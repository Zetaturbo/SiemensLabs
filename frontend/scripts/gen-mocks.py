#!/usr/bin/env python3
"""Regenerate every data-API mock in src/lib/data-api/mocks/ from data/supplier_risk_dataset.csv.

Run from frontend/ (no global installs needed):

    uv run --with pandas --with numpy python -I scripts/gen-mocks.py          # write the mocks
    uv run --with pandas --with numpy python -I scripts/gen-mocks.py --check  # fail if committed mocks are stale

Every number in the mocks is computed here from the CSV. The output is deterministic: no timestamps,
fixed key order, fixed tie-breaks (supplier_id ascending), floats rounded to 2 decimals.

Contract: ARCHITECTURE.md sections 4 and 5 (field names, envelope, tool shapes). Choices the contract
leaves open are documented in src/lib/data-api/mocks/README.md and marked "DECISION" below.
"""

from __future__ import annotations

import json
import math
import re
import sys
from fractions import Fraction
from pathlib import Path

import numpy as np
import pandas as pd

FRONTEND = Path(__file__).resolve().parents[1]
REPO = FRONTEND.parent
CSV = REPO / "data" / "supplier_risk_dataset.csv"
CRITERIA_MD = REPO / "data" / "risk_criteria_description.md"
OUT = FRONTEND / "src" / "lib" / "data-api" / "mocks"
MAX_BYTES = 200 * 1024

# --------------------------------------------------------------------------------------------------
# Dataset conventions (ARCHITECTURE.md section 4)
# --------------------------------------------------------------------------------------------------

LEVELS = ["Low", "Medium", "High", "Critical"]
LEVEL_BANDS = {"Low": [0, 24], "Medium": [25, 49], "High": [50, 74], "Critical": [75, 100]}
SOURCING_LEVELS = ["Low", "Medium", "High"]
COMPLEXITY_LEVELS = ["Simple", "Moderate", "Complex"]

# The 18 sub-scores, in CSV column order. field -> (CSV column, label)
SCORES = {
    "industry_benchmark": ("Industry_Benchmark_Score", "Industry Benchmark"),
    "media_sentiment": ("Media_Sentiment_Score", "Media Sentiment"),
    "external_intelligence": ("External_Intelligence_Score", "External Intelligence"),
    "sub_tier_visibility": ("Sub_Tier_Visibility_Score", "Sub-Tier Visibility"),
    "labor_stability": ("Labor_Stability_Score", "Labor Stability"),
    "financial_health": ("Financial_Health_Score", "Financial Health"),
    "compliance_risk": ("Compliance_Risk_Score", "Compliance Risk"),
    "safety_incident": ("Safety_Incident_Score", "Safety Incident"),
    "environmental_exposure": ("Environmental_Exposure_Score", "Environmental Exposure"),
    "esg_performance": ("ESG_Performance_Score", "ESG Performance"),
    "digital_security": ("Digital_Security_Score", "Digital Security"),
    "operational_resilience": ("Operational_Resilience_Score", "Operational Resilience"),
    "market_sentiment": ("Market_Sentiment_Score", "Market Sentiment"),
    "quality_risk": ("Quality_Risk_Score", "Quality Risk"),
    "governance_risk": ("Governance_Risk_Score", "Governance Risk"),
    "geopolitical_risk": ("Geopolitical_Risk_Score", "Geopolitical Risk"),
    "political_stability": ("Political_Stability_Score", "Political Stability"),
    "credit_rating": ("Credit_Rating_Score", "Credit Rating"),
}
SCORE_FIELDS = list(SCORES)

# Official Total_Risk_Index weights. Verified below: TRI == round_half_even(sum(w * score)) for every row.
OFFICIAL_WEIGHTS = {
    "operational_resilience": 0.10,
    "financial_health": 0.10,
    "quality_risk": 0.10,
    "compliance_risk": 0.08,
    "credit_rating": 0.06,
    "safety_incident": 0.06,
    "sub_tier_visibility": 0.06,
    "geopolitical_risk": 0.05,
    "governance_risk": 0.05,
    "esg_performance": 0.05,
    "labor_stability": 0.04,
    "environmental_exposure": 0.04,
    "digital_security": 0.04,
    "industry_benchmark": 0.04,
    "political_stability": 0.04,
    "market_sentiment": 0.03,
    "media_sentiment": 0.03,
    "external_intelligence": 0.03,
}

# Numeric operational metrics: field -> (CSV column, label, direction, unit)
METRICS = {
    "po_volume_eur": ("Purchase Order Volume (EUR)", "PO Volume (EUR)", "exposure", "EUR"),
    "order_change_rate": ("Order Change Rate", "Order Change Rate", "higher_is_worse", "percent"),
    "delivery_rating": ("Supplier Delivery Rating", "Delivery Rating", "higher_is_better", "percent"),
    "order_confirmation_rate": ("Order Confirmation Rate", "Order Confirmation Rate", "higher_is_better", "percent"),
}
CATEGORIES = {
    "sourcing_risk_level": ("Sourcing Risk Level", "Sourcing Risk Level", SOURCING_LEVELS),
    "supply_chain_complexity": ("Supply Chain Complexity", "Supply Chain Complexity", COMPLEXITY_LEVELS),
}
DERIVED = ["delivery_risk", "confirmation_risk", "change_risk"]

# DECISION: family mapping (contract names the five families but not the members).
# Each of the 18 scores belongs to exactly one family; family_scores use only these 18 scores,
# weighted by their official weights renormalized inside the family.
FAMILIES = {
    "financial": (
        "Financial",
        "Financial stability and creditworthiness. This is what \"financial risk\" means.",
        ["financial_health", "credit_rating"],
    ),
    "operational_quality": (
        "Operational quality",
        "How well and how safely the supplier produces: defects, accidents, labor disputes, cyber incidents.",
        ["quality_risk", "safety_incident", "labor_stability", "digital_security"],
    ),
    "compliance_governance": (
        "Compliance and governance",
        "Legal, regulatory, ethics and sustainability conduct, and standing against industry standards.",
        ["compliance_risk", "governance_risk", "esg_performance", "industry_benchmark"],
    ),
    "external_environment": (
        "External environment",
        "Country, natural-hazard and reputation signals from outside the supplier.",
        ["geopolitical_risk", "political_stability", "environmental_exposure", "media_sentiment",
         "market_sentiment", "external_intelligence"],
    ),
    "supply_chain_structure": (
        "Supply chain structure",
        "Ability of the supplier's own network to deliver: production and logistics resilience, Tier-N visibility, "
        "and delivery performance metrics.",
        ["operational_resilience", "sub_tier_visibility"],
    ),
}
FAMILY_OF = {f: fam for fam, (_, _, members) in FAMILIES.items() for f in members}
# Non-score fields grouped for the UI (not part of family_scores).
for _f in ["order_change_rate", "delivery_rating", "order_confirmation_rate", "sourcing_risk_level",
           "supply_chain_complexity", *DERIVED]:
    FAMILY_OF[_f] = "supply_chain_structure"

PROFILES = [
    {
        "profile_id": "default",
        "label": "Default (official Total Risk Index)",
        "description": "The official Total Risk Index weights across all 18 risk dimensions. Use when no category-specific profile applies.",
        "weights": dict(OFFICIAL_WEIGHTS),
    },
    {
        "profile_id": "safety_critical",
        "label": "Safety-critical component",
        "description": "Brakes, bogies, signalling. Quality, safety and compliance weighted highest.",
        "weights": {
            "quality_risk": 0.25, "safety_incident": 0.15, "compliance_risk": 0.15, "operational_resilience": 0.15,
            "sub_tier_visibility": 0.10, "delivery_risk": 0.10, "financial_health": 0.05, "governance_risk": 0.05,
        },
    },
    {
        "profile_id": "strategic_system",
        "label": "Strategic system",
        "description": "Car body, traction, train control. Long-term, high-spend partnerships that are hard to switch: "
                       "financial stability, resilience and quality first, then cyber and country risk.",
        "weights": {
            "financial_health": 0.15, "credit_rating": 0.10, "operational_resilience": 0.12, "quality_risk": 0.12,
            "sub_tier_visibility": 0.08, "geopolitical_risk": 0.08, "digital_security": 0.08,
            "governance_risk": 0.07, "political_stability": 0.05, "compliance_risk": 0.05, "safety_incident": 0.05,
            "delivery_risk": 0.05,
        },
    },
    {
        "profile_id": "commodity",
        "label": "Commodity part",
        "description": "Standard parts with many alternative sources (fasteners, cables, HVAC units). "
                       "Delivery performance and order reliability weighted highest, then quality.",
        "weights": {
            "delivery_risk": 0.20, "confirmation_risk": 0.15, "quality_risk": 0.15, "change_risk": 0.10,
            "operational_resilience": 0.10, "financial_health": 0.10, "credit_rating": 0.05, "compliance_risk": 0.05,
            "esg_performance": 0.05, "labor_stability": 0.05,
        },
    },
    {
        "profile_id": "lksg_due_diligence",
        "label": "LkSG due diligence",
        "description": "Supply Chain Due Diligence Act (LkSG) focus: human rights, labor, environment and ethics "
                       "across direct and Tier-N suppliers.",
        "weights": {
            "esg_performance": 0.20, "labor_stability": 0.15, "compliance_risk": 0.15, "governance_risk": 0.12,
            "sub_tier_visibility": 0.12, "safety_incident": 0.08, "geopolitical_risk": 0.08,
            "media_sentiment": 0.05, "external_intelligence": 0.05,
        },
    },
]
PROFILE_BY_ID = {p["profile_id"]: p for p in PROFILES}

# --------------------------------------------------------------------------------------------------
# Inputs each mock answers (keep in sync with mocks/README.md)
# --------------------------------------------------------------------------------------------------

COMPARE_IDS = ["SUPP_00012", "SUPP_00450", "SUPP_00731"]
EXPLAIN_ID = "SUPP_00018"
HARD_REQUIREMENTS = [
    {"field": "quality_risk_level", "op": "ne", "value": "Critical"},
    {"field": "delivery_rating", "op": "gte", "value": 90},
]
INPUTS = {
    "get_metadata": {},
    "list_profiles": {},
    "get_suppliers": {"ids": COMPARE_IDS + [EXPLAIN_ID], "fields": None},
    "filter_suppliers": {
        "conditions": HARD_REQUIREMENTS,
        "sort_by": [{"field": "total_risk_index", "order": "asc"}],
        "fields": None,
        "limit": 20,
        "offset": 0,
    },
    "rank_with_profile": {
        "ids": None,
        "conditions": HARD_REQUIREMENTS,
        "profile_id": "safety_critical",
        "custom_weights": None,
        "limit": 20,
    },
    "compare_suppliers": {"ids": COMPARE_IDS, "fields": None, "profile_id": "default"},
    "explain_supplier": {"id": EXPLAIN_ID, "profile_id": "default"},
    "find_similar": {
        "id": "SUPP_00450",
        "must_be_lower": ["geopolitical_risk", "environmental_exposure"],
        "conditions": [],
        "limit": 5,
    },
    "kraljic_position": {"ids": COMPARE_IDS + [EXPLAIN_ID]},
    "get_dataset_stats": {
        "fields": ["total_risk_index", "financial_health", "credit_rating", "po_volume_eur"],
        "conditions": [],
    },
    "run_sql": {
        "query": "SELECT total_risk_index_level AS level, COUNT(*) AS n FROM suppliers "
                 "GROUP BY level ORDER BY n DESC, level",
    },
}

# --------------------------------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------------------------------


def num(x, nd: int = 2):
    """JSON-safe number: numpy -> Python, floats rounded to nd decimals, whole floats emitted as int."""
    if x is None:
        return None
    if isinstance(x, (bool, np.bool_)):
        return bool(x)
    if isinstance(x, (int, np.integer)):
        return int(x)
    v = round(float(x), nd)
    if math.isnan(v):
        return None
    if v == 0:
        return 0
    return int(v) if v.is_integer() else v


def envelope(data, **meta):
    return {"ok": True, "data": data, "meta": meta, "error": None}


def load() -> tuple[pd.DataFrame, list[str]]:
    raw = pd.read_csv(CSV)
    rename = {"supplierID": "supplier_id", "Supplier Name": "supplier_name",
              "Total_Risk_Index": "total_risk_index", "Total_Risk_Index_Level": "total_risk_index_level"}
    for f, (col, _) in SCORES.items():
        rename[col] = f
        rename[f"{col}_Level"] = f"{f}_level"
    for f, (col, *_rest) in METRICS.items():
        rename[col] = f
    for f, (col, *_rest) in CATEGORIES.items():
        rename[col] = f
    missing = set(raw.columns) - set(rename)
    assert not missing, f"unmapped CSV columns: {missing}"
    df = raw.rename(columns=rename)
    source_fields = list(df.columns)  # "all fields", in CSV order
    for c in ["supplier_id", "supplier_name", *[c for c in source_fields if c.endswith("_level")],
              *CATEGORIES]:
        df[c] = df[c].astype(object)
    assert df["supplier_id"].is_unique
    return df, source_fields


def check_dataset(df: pd.DataFrame) -> dict:
    """Assert the dataset facts the mocks rely on; return the weight-verification numbers."""
    assert len(df) == 10_000, len(df)
    # Level bands match the published *_level columns.
    for f in ["total_risk_index", *SCORE_FIELDS]:
        band = pd.cut(df[f], [-1, 24, 49, 74, 100], labels=LEVELS).astype(object)
        assert (band == df[f"{f}_level"]).all(), f"level band mismatch for {f}"
    assert set(df["sourcing_risk_level"]) == set(SOURCING_LEVELS)
    assert set(df["supply_chain_complexity"]) == set(COMPLEXITY_LEVELS)
    for p in PROFILES:
        assert abs(sum(p["weights"].values()) - 1.0) < 1e-9, p["profile_id"]
        for f in p["weights"]:
            assert f in SCORE_FIELDS or f in DERIVED, (p["profile_id"], f)
    assert set(FAMILY_OF) >= set(SCORE_FIELDS)

    # Least-squares fit of TRI on the 18 scores (no intercept) recovers the official weights.
    X = df[SCORE_FIELDS].to_numpy(float)
    y = df["total_risk_index"].to_numpy(float)
    fitted, *_ = np.linalg.lstsq(X, y, rcond=None)
    rmse_fit = float(np.sqrt(np.mean((X @ fitted - y) ** 2)))
    w = np.array([OFFICIAL_WEIGHTS[f] for f in SCORE_FIELDS])
    rmse_official = float(np.sqrt(np.mean((X @ w - y) ** 2)))
    max_weight_dev = float(np.max(np.abs(fitted - w)))
    assert rmse_fit < 0.30 and rmse_official < 0.30 and max_weight_dev < 0.001, (rmse_fit, max_weight_dev)
    # Exact check with rational arithmetic: TRI is the weighted sum rounded half-to-even.
    wf = {f: Fraction(round(OFFICIAL_WEIGHTS[f] * 100), 100) for f in SCORE_FIELDS}
    exact = sum(
        round(sum(wf[f] * int(v) for f, v in zip(SCORE_FIELDS, row, strict=True))) == tri
        for row, tri in zip(df[SCORE_FIELDS].itertuples(index=False), df["total_risk_index"], strict=True)
    )
    assert exact == len(df), exact
    return {
        "method": "least squares of total_risk_index on the 18 sub-scores, no intercept",
        "rmse_fitted_weights": num(rmse_fit, 4),
        "rmse_official_weights": num(rmse_official, 4),
        "max_abs_weight_deviation": num(max_weight_dev, 4),
        "exact_rule": "total_risk_index = round_half_even(sum(official_weight * sub_score))",
        "rows_matching_exact_rule": exact,
        "rows": len(df),
    }


def add_derived(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    full = df.copy()
    lo, hi = float(df["order_change_rate"].min()), float(df["order_change_rate"].max())
    full["delivery_risk"] = 100 - df["delivery_rating"]
    full["confirmation_risk"] = 100 - df["order_confirmation_rate"]
    full["change_risk"] = 100 * (df["order_change_rate"] - lo) / (hi - lo)
    return full, {"order_change_rate_min": num(lo), "order_change_rate_max": num(hi)}


def field_direction(f: str) -> str | None:
    if f in SCORE_FIELDS or f == "total_risk_index" or f in DERIVED or f.endswith("_level") or f in CATEGORIES:
        return "higher_is_worse"
    if f in METRICS:
        return METRICS[f][2]
    return None


ORDINALS = {"sourcing_risk_level": SOURCING_LEVELS, "supply_chain_complexity": COMPLEXITY_LEVELS}


def ordinal(full: pd.DataFrame, f: str, values):
    order = ORDINALS.get(f, LEVELS if f.endswith("_level") else None)
    if order is None:
        return full[f], values
    rank = {v: i for i, v in enumerate(order)}
    conv = (lambda v: [rank[x] for x in v]) if isinstance(values, list) else (lambda v: rank[v])
    return full[f].map(rank), conv(values)


def mask(full: pd.DataFrame, conditions) -> pd.Series:
    """AND-combine filter conditions (ARCHITECTURE.md 5, shared input type). Level and category
    fields compare by their ordinal order for lt/lte/gt/gte/between."""
    m = pd.Series(True, index=full.index)
    for c in conditions or []:
        f, op, v = c["field"], c["op"], c["value"]
        if f not in full.columns:
            raise KeyError(f"UNKNOWN_FIELD {f}")
        col = full[f]
        if op == "eq":
            m &= col == v
        elif op == "ne":
            m &= col != v
        elif op == "in":
            m &= col.isin(v)
        elif op == "not_in":
            m &= ~col.isin(v)
        else:
            col, v = ordinal(full, f, v)
            if op == "lt":
                m &= col < v
            elif op == "lte":
                m &= col <= v
            elif op == "gt":
                m &= col > v
            elif op == "gte":
                m &= col >= v
            elif op == "between":
                m &= (col >= v[0]) & (col <= v[1])
            else:
                raise ValueError(f"INVALID_FILTER {op}")
    return m


def record(row: pd.Series, fields) -> dict:
    out = {}
    for f in fields:
        v = row[f]
        out[f] = v if isinstance(v, str) else num(v)
    return out


def profile_scores(frame: pd.DataFrame, weights: dict) -> pd.Series:
    """Weighted sum on the 0-100 scale (weights sum to 1), lower is better. Rounded to 9 decimals so
    float noise never breaks the supplier_id tie-break."""
    s = sum(frame[f] * w for f, w in weights.items())
    return s.round(9)


def rank_order(frame: pd.DataFrame, score: pd.Series) -> pd.Index:
    tmp = pd.DataFrame({"s": score, "id": frame["supplier_id"]})
    return tmp.sort_values(["s", "id"], kind="mergesort").index


def percentile(full: pd.DataFrame, f: str, value) -> float:
    """Share of suppliers with a strictly lower value, in percent."""
    return num((full[f] < value).mean() * 100)


def family_weights(weights: dict) -> dict:
    out = {fam: 0.0 for fam in FAMILIES}
    for f, w in weights.items():
        out[FAMILY_OF[f]] += w
    return {k: num(v, 4) for k, v in out.items()}


# --------------------------------------------------------------------------------------------------
# Tools
# --------------------------------------------------------------------------------------------------


def parse_criteria() -> dict:
    """CSV column name -> description, read from data/risk_criteria_description.md."""
    out, current = {}, None
    for line in CRITERIA_MD.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^- \*\*(.+?):\*\*\s*(.*)$", line)
        if m:
            current = m.group(1)
            out[current] = m.group(2).strip()
            continue
        m = re.match(r"^\s+- (.+)$", line)
        if m and current:
            out[current] = out[current].rstrip() + " " + m.group(1).strip()
    return out


def get_metadata(df, source_fields, weight_check, derived_consts) -> dict:
    desc = parse_criteria()

    def entry(field, label, description, type_, direction=None, family=None, official_weight=None, unit=None,
              source_column=None, level_field=None, values=None, formula=None):
        return {
            "field": field, "label": label, "description": description, "type": type_, "direction": direction,
            "family": family, "official_weight": official_weight, "unit": unit, "source_column": source_column,
            "level_field": level_field, "values": values, "formula": formula,
        }

    lo, hi = derived_consts["order_change_rate_min"], derived_consts["order_change_rate_max"]
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
        fields.append(entry(f, label, desc[col], "metric", direction, FAMILY_OF.get(f), unit=unit,
                            source_column=col))
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
              "derived", "higher_is_worse", FAMILY_OF["delivery_risk"], unit="score",
              formula="100 - delivery_rating"),
        entry("confirmation_risk", "Confirmation Risk",
              "Derived for profile weights: 100 minus the order confirmation rate.",
              "derived", "higher_is_worse", FAMILY_OF["confirmation_risk"], unit="score",
              formula="100 - order_confirmation_rate"),
        entry("change_risk", "Change Risk",
              "Derived for profile weights: order change rate min-max rescaled to 0-100 over the dataset.",
              "derived", "higher_is_worse", FAMILY_OF["change_risk"], unit="score",
              formula=f"100 * (order_change_rate - {lo}) / ({hi} - {lo})"),
    ]
    assert set(source_fields) | set(DERIVED) == {f["field"] for f in fields}
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
        "dataset_rows": len(df),
        "official_weights_check": weight_check,
    }
    return envelope(data, row_count=len(fields), truncated=False)


def list_profiles() -> dict:
    profiles = []
    for p in PROFILES:
        weights = dict(sorted(p["weights"].items(), key=lambda kv: (-kv[1], kv[0])))
        profiles.append({
            "profile_id": p["profile_id"], "label": p["label"], "description": p["description"],
            "weights": {k: num(v, 4) for k, v in weights.items()},
            "family_weights": family_weights(p["weights"]),
        })
    return envelope({"profiles": profiles}, row_count=len(profiles), truncated=False)


def get_suppliers(df, source_fields, inp) -> dict:
    by_id = df.set_index("supplier_id", drop=False)
    fields = inp["fields"] or source_fields
    rows = [record(by_id.loc[i], fields) for i in inp["ids"]]
    return envelope({"suppliers": rows}, row_count=len(rows), truncated=False, mock_input=inp)


def filter_suppliers(full, source_fields, inp) -> dict:
    sub = full[mask(full, inp["conditions"])]
    keys = [s["field"] for s in inp["sort_by"]] + ["supplier_id"]
    asc = [s["order"] == "asc" for s in inp["sort_by"]] + [True]
    sub = sub.sort_values(keys, ascending=asc, kind="mergesort")
    page = sub.iloc[inp["offset"]: inp["offset"] + inp["limit"]]
    fields = inp["fields"] or source_fields
    if "supplier_id" not in fields:
        fields = ["supplier_id", *fields]
    rows = [record(r, fields) for _, r in page.iterrows()]
    data = {"total_matching": int(len(sub)), "suppliers": rows}
    return envelope(data, row_count=len(rows), truncated=bool(len(sub) > inp["offset"] + len(rows)),
                    mock_input=inp)


def rank_with_profile(full, inp) -> dict:
    pid = inp["profile_id"]
    weights = inp["custom_weights"] or PROFILE_BY_ID[pid]["weights"]
    cand = full[full["supplier_id"].isin(inp["ids"])] if inp["ids"] else full[mask(full, inp["conditions"])]
    ps = profile_scores(cand, weights)
    order = rank_order(cand, ps)
    default_order = rank_order(cand, profile_scores(cand, OFFICIAL_WEIGHTS))
    default_rank = {idx: i + 1 for i, idx in enumerate(default_order)}
    ranking = []
    for i, idx in enumerate(order[: inp["limit"]]):
        row = cand.loc[idx]
        contrib = sorted(((f, w * row[f]) for f, w in weights.items() if w * row[f] > 0),
                         key=lambda t: (-t[1], t[0]))[:3]
        ranking.append({
            "rank": i + 1,
            "supplier_id": row["supplier_id"],
            "supplier_name": row["supplier_name"],
            "profile_score": num(ps[idx]),
            "total_risk_index": num(row["total_risk_index"]),
            "default_rank": default_rank[idx],
            "rank_change": default_rank[idx] - (i + 1),
            "top_contributors": [{"field": f, "value": num(row[f]), "contribution": num(c)} for f, c in contrib],
        })
    data = {
        "profile_id": pid,
        "weights": {k: num(v, 4) for k, v in sorted(weights.items(), key=lambda kv: (-kv[1], kv[0]))},
        "total_matching": int(len(cand)),
        "ranking": ranking,
    }
    return envelope(data, row_count=len(ranking), truncated=bool(len(cand) > len(ranking)), profile_id=pid,
                    mock_input=inp)


COMPARE_FIELDS = ["total_risk_index", *SCORE_FIELDS, *METRICS]


def compare_suppliers(full, inp) -> dict:
    ids, pid = inp["ids"], inp["profile_id"]
    assert len(ids) <= 20
    fields = inp["fields"] or COMPARE_FIELDS
    by_id = full.set_index("supplier_id", drop=False)
    rows = by_id.loc[ids]
    ps = profile_scores(rows, PROFILE_BY_ID[pid]["weights"])
    suppliers = []
    for i in ids:
        r = rows.loc[i]
        rec = record(r, ["supplier_id", "supplier_name", *fields])
        for f in fields:
            if f"{f}_level" in by_id.columns:
                rec[f"{f}_level"] = r[f"{f}_level"]
        rec.update(record(r, list(CATEGORIES)))
        rec["profile_score"] = num(ps[i])
        suppliers.append(rec)

    per_field = []
    for f in fields:
        vals = [(i, float(rows.loc[i, f])) for i in ids]  # input order = tie-break
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
        r = rows.loc[i]
        entry = {"supplier_id": i}
        for fam, (_, _, members) in FAMILIES.items():
            tw = sum(OFFICIAL_WEIGHTS[m] for m in members)
            entry[fam] = num(sum(OFFICIAL_WEIGHTS[m] * r[m] for m in members) / tw)
        family_scores.append(entry)

    spreads = {p["field"]: p["spread"] for p in per_field if p["field"] in SCORE_FIELDS}
    largest = sorted(spreads, key=lambda f: (-spreads[f], -OFFICIAL_WEIGHTS[f], SCORE_FIELDS.index(f)))[:3]
    data = {"suppliers": suppliers, "per_field": per_field, "family_scores": family_scores,
            "largest_differences": largest}
    return envelope(data, row_count=len(suppliers), truncated=False, profile_id=pid, mock_input=inp)


def explain_supplier(full, inp) -> dict:
    sid, pid = inp["id"], inp["profile_id"]
    weights = PROFILE_BY_ID[pid]["weights"]
    row = full.set_index("supplier_id", drop=False).loc[sid]
    contributions = []
    for f, w in weights.items():
        mean = float(full[f].mean())
        contributions.append({
            "field": f,
            "value": num(row[f]),
            "level": row[f"{f}_level"] if f in SCORE_FIELDS else None,
            "weight": num(w, 4),
            "percentile": percentile(full, f, row[f]),
            "dataset_mean": num(mean),
            "contribution_vs_mean": w * (float(row[f]) - mean),
        })
    contributions.sort(key=lambda c: (-c["contribution_vs_mean"], c["field"]))
    for c in contributions:
        c["contribution_vs_mean"] = num(c["contribution_vs_mean"])
    # Critical fields over all 18 scores, in the order they appear in contributions, then official weight.
    pos = {c["field"]: i for i, c in enumerate(contributions)}
    crit = [f for f in SCORE_FIELDS if row[f"{f}_level"] == "Critical"]
    crit.sort(key=lambda f: (pos.get(f, len(pos)), -OFFICIAL_WEIGHTS[f], f))
    data = {
        "supplier_id": sid,
        "supplier_name": row["supplier_name"],
        "profile_id": pid,
        "total_risk_index": num(row["total_risk_index"]),
        "total_risk_level": row["total_risk_index_level"],
        "percentile": percentile(full, "total_risk_index", row["total_risk_index"]),
        "dataset_mean": num(full["total_risk_index"].mean()),
        "profile_score": num(profile_scores(full[full["supplier_id"] == sid], weights).iloc[0]),
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
    return envelope(data, row_count=1, truncated=False, profile_id=pid, mock_input=inp)


def find_similar(full, inp) -> dict:
    sid = inp["id"]
    ref = full.set_index("supplier_id", drop=False).loc[sid]
    cand = full[mask(full, inp["conditions"]) & (full["supplier_id"] != sid)]
    for f in inp["must_be_lower"]:
        cand = cand[cand[f] < ref[f]]
    diff = cand[SCORE_FIELDS].astype(float) - ref[SCORE_FIELDS].astype(float).to_numpy()
    dist = np.sqrt((diff ** 2).sum(axis=1)).round(9)
    order = rank_order(cand, dist)[: inp["limit"]]
    similar = []
    for idx in order:
        r = cand.loc[idx]
        similar.append({
            "supplier_id": r["supplier_id"],
            "supplier_name": r["supplier_name"],
            "distance": num(dist[idx]),
            "total_risk_index": num(r["total_risk_index"]),
            "differences": {f: num(r[f] - ref[f]) for f in inp["must_be_lower"]},
        })
    data = {
        "reference": sid,
        "reference_values": {"total_risk_index": num(ref["total_risk_index"]),
                             **{f: num(ref[f]) for f in inp["must_be_lower"]}},
        "total_matching": int(len(cand)),
        "similar": similar,
    }
    return envelope(data, row_count=len(similar), truncated=bool(len(cand) > len(similar)), mock_input=inp)


SUPPLY_RISK_HIGH = ["High"]  # DECISION (lead): Medium sourcing risk counts as low supply risk.


def quadrant(spend_high: bool, risk_high: bool) -> str:
    if spend_high:
        return "strategic" if risk_high else "leverage"
    return "bottleneck" if risk_high else "non_critical"


def kraljic_position(full, inp) -> dict:
    threshold = float(full["po_volume_eur"].quantile(0.75))  # linear interpolation
    spend_high = full["po_volume_eur"] >= threshold
    risk_high = full["sourcing_risk_level"].isin(SUPPLY_RISK_HIGH)
    quads = pd.Series([quadrant(s, r) for s, r in zip(spend_high, risk_high, strict=True)], index=full.index)
    counts = {q: int((quads == q).sum()) for q in ["strategic", "leverage", "bottleneck", "non_critical"]}
    by_id = full.set_index("supplier_id", drop=False)
    suppliers = []
    for i in inp["ids"]:
        r = by_id.loc[i]
        sh, rh = bool(r["po_volume_eur"] >= threshold), r["sourcing_risk_level"] in SUPPLY_RISK_HIGH
        suppliers.append({
            "supplier_id": i,
            "supplier_name": r["supplier_name"],
            "po_volume_eur": num(r["po_volume_eur"]),
            "sourcing_risk_level": r["sourcing_risk_level"],
            "spend_high": sh,
            "supply_risk_high": rh,
            "quadrant": quadrant(sh, rh),
        })
    data = {
        "thresholds": {"po_volume_eur_high": num(threshold), "po_volume_eur_percentile": 75,
                       "supply_risk_high_levels": SUPPLY_RISK_HIGH},
        "quadrant_counts": counts,
        "suppliers": suppliers,
    }
    return envelope(data, row_count=len(suppliers), truncated=False, mock_input=inp)


def get_dataset_stats(full, inp) -> dict:
    sub = full[mask(full, inp["conditions"])]
    stats = []
    for f in inp["fields"]:
        s = sub[f]
        q = s.quantile([0.25, 0.5, 0.75])  # linear interpolation
        lvl = f"{f}_level"
        level_counts = None
        if lvl in sub.columns:
            vc = sub[lvl].value_counts()
            level_counts = {k: int(vc.get(k, 0)) for k in LEVELS}
        stats.append({
            "field": f, "count": int(s.count()), "mean": num(s.mean()), "std": num(s.std()),
            "p25": num(q[0.25]), "median": num(q[0.5]), "p75": num(q[0.75]), "min": num(s.min()),
            "max": num(s.max()), "level_counts": level_counts,
        })
    return envelope({"stats": stats}, row_count=len(stats), truncated=False, mock_input=inp)


def run_sql(full, inp) -> dict:
    # pandas equivalent of inp["query"] (no SQL engine needed for the mock).
    vc = full["total_risk_index_level"].value_counts()
    rows = sorted(([lvl, int(n)] for lvl, n in vc.items()), key=lambda r: (-r[1], r[0]))
    return envelope({"columns": ["level", "n"], "rows": rows}, row_count=len(rows), truncated=False,
                    mock_input=inp)


# --------------------------------------------------------------------------------------------------


def build() -> dict[str, str]:
    df, source_fields = load()
    weight_check = check_dataset(df)
    full, derived_consts = add_derived(df)
    mocks = {
        "get_metadata": get_metadata(df, source_fields, weight_check, derived_consts),
        "list_profiles": list_profiles(),
        "get_suppliers": get_suppliers(df, source_fields, INPUTS["get_suppliers"]),
        "filter_suppliers": filter_suppliers(full, source_fields, INPUTS["filter_suppliers"]),
        "rank_with_profile": rank_with_profile(full, INPUTS["rank_with_profile"]),
        "compare_suppliers": compare_suppliers(full, INPUTS["compare_suppliers"]),
        "explain_supplier": explain_supplier(full, INPUTS["explain_supplier"]),
        "find_similar": find_similar(full, INPUTS["find_similar"]),
        "kraljic_position": kraljic_position(full, INPUTS["kraljic_position"]),
        "get_dataset_stats": get_dataset_stats(full, INPUTS["get_dataset_stats"]),
        "run_sql": run_sql(full, INPUTS["run_sql"]),
    }
    out = {}
    for name, env in mocks.items():
        assert list(env) == ["ok", "data", "meta", "error"] and env["ok"] is True and env["error"] is None
        text = json.dumps(env, indent=2, ensure_ascii=False, allow_nan=False) + "\n"
        assert len(text.encode()) < MAX_BYTES, (name, len(text))
        out[f"{name}.json"] = text
    return out


def main() -> int:
    files = build()
    if "--check" in sys.argv[1:]:
        stale = [n for n, t in files.items() if not (OUT / n).exists() or (OUT / n).read_text("utf-8") != t]
        for n in stale:
            print(f"stale: {n}")
        print("mocks up to date" if not stale else f"{len(stale)} stale mock(s); rerun without --check")
        return 1 if stale else 0
    OUT.mkdir(parents=True, exist_ok=True)
    for name, text in files.items():
        (OUT / name).write_text(text, encoding="utf-8")
        print(f"wrote {name} ({len(text.encode()) / 1024:.1f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
