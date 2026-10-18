"""Field catalog, families and sourcing profiles.

Field names follow docs/ARCHITECTURE.md section 4. Families, profiles and official weights are the
same as frontend/scripts/gen-mocks.py, so the service and the frontend mocks agree. Keep both in sync
until the mocks are generated from this service.
"""

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

# Official Total_Risk_Index weights: TRI == round_half_even(sum(w * score)) for every row
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

# "All fields" of a supplier row, in CSV order (columns of the supplier_wide view)
SOURCE_FIELDS = [
    "supplier_id", "supplier_name", "total_risk_index", "total_risk_index_level",
    *[x for f in SCORE_FIELDS for x in (f, f"{f}_level")],
    *METRICS, *CATEGORIES,
]
ALL_FIELDS = [*SOURCE_FIELDS, *DERIVED]
NUMERIC_FIELDS = ["total_risk_index", *SCORE_FIELDS, *METRICS, *DERIVED]
TEXT_FIELDS = ["supplier_id", "supplier_name"]

# Fields compared by their ordinal order for lt/lte/gt/gte/between and for sorting
ORDINALS = {
    **{f"{f}_level": LEVELS for f in ["total_risk_index", *SCORE_FIELDS]},
    "sourcing_risk_level": SOURCING_LEVELS,
    "supply_chain_complexity": COMPLEXITY_LEVELS,
}

# Each of the 18 scores belongs to exactly one family. family_scores use only these 18 scores,
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
# Non-score fields grouped for the UI (not part of family_scores)
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


def field_direction(f: str) -> str | None:
    if f in SCORE_FIELDS or f == "total_risk_index" or f in DERIVED or f in ORDINALS:
        return "higher_is_worse"
    if f in METRICS:
        return METRICS[f][2]
    return None
