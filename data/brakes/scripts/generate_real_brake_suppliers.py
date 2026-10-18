"""Generate placeholder risk scores for real brake manufacturers.

The company names, headquarters countries and brake segments are real (from
public knowledge, not yet verified). Every score and KPI is SIMULATED so the
dashboard has data to show until the research agent enriches each company.

Same 46 columns as data/eval/source/supplier_risk_data.csv, plus:

  Country, Region      headquarters location
  Brake Segments       brake markets the company is known for
  Data Status          provenance of the scores ("Simulated" until researched)

Output is deterministic for a given seed.

Usage:
    python3 data/brakes/scripts/generate_real_brake_suppliers.py --seed 11

Standard library only.
"""

import argparse
import csv
import random
from pathlib import Path

SCORE_FIELDS = [
    "Industry_Benchmark_Score", "Media_Sentiment_Score", "External_Intelligence_Score",
    "Sub_Tier_Visibility_Score", "Labor_Stability_Score", "Financial_Health_Score",
    "Compliance_Risk_Score", "Safety_Incident_Score", "Environmental_Exposure_Score",
    "ESG_Performance_Score", "Digital_Security_Score", "Operational_Resilience_Score",
    "Market_Sentiment_Score", "Quality_Risk_Score", "Governance_Risk_Score",
    "Geopolitical_Risk_Score", "Political_Stability_Score", "Credit_Rating_Score",
]
TRI = "Total_Risk_Index"

# Same column order as data/eval/source/supplier_risk_data.csv, then the brake attributes
BASE_COLUMNS = ["supplierID", "Supplier Name"]
for _f in [TRI, *SCORE_FIELDS]:
    BASE_COLUMNS += [_f, f"{_f}_Level"]
BASE_COLUMNS += [
    "Purchase Order Volume (EUR)", "Order Change Rate", "Supplier Delivery Rating",
    "Order Confirmation Rate", "Sourcing Risk Level", "Supply Chain Complexity",
]
EXTRA_COLUMNS = ["Country", "Region", "Brake Segments", "Data Status"]

# country: (region, geopolitical base, political base, environmental base, ESG base)
COUNTRIES = {
    "Germany": ("EU", 15, 12, 20, 25),
    "Italy": ("EU", 22, 28, 38, 30),
    "Sweden": ("EU", 10, 8, 12, 18),
    "Denmark": ("EU", 10, 8, 14, 18),
    "United States": ("North America", 22, 30, 40, 38),
    "Japan": ("Asia-Pacific", 20, 15, 72, 28),
    "South Korea": ("Asia-Pacific", 35, 25, 35, 35),
}

# (name, headquarters country, brake segments)
COMPANIES = [
    ("Brembo", "Italy", ["Passenger car", "Commercial vehicle"]),
    ("Knorr-Bremse AG", "Germany", ["Rail", "Commercial vehicle"]),
    ("Wabtec Corporation", "United States", ["Rail"]),
    ("ZF Friedrichshafen AG", "Germany", ["Passenger car", "Commercial vehicle"]),
    ("Robert Bosch GmbH", "Germany", ["Passenger car"]),
    ("Akebono Brake Industry Co., Ltd.", "Japan", ["Passenger car", "Rail"]),
    ("ADVICS Co., Ltd.", "Japan", ["Passenger car"]),
    ("Hitachi Astemo, Ltd.", "Japan", ["Passenger car"]),
    ("HL Mando Corporation", "South Korea", ["Passenger car"]),
    ("TMD Friction", "Germany", ["Passenger car", "Commercial vehicle"]),
    ("Haldex AB", "Sweden", ["Commercial vehicle"]),
    ("Svendborg Brakes", "Denmark", ["Wind turbine", "Industrial"]),
]

LEVELS = [(75, "Critical"), (50, "High"), (25, "Medium"), (0, "Low")]


def level_of(score):
    return next(name for cut, name in LEVELS if score >= cut)


def clip(v, lo=0, hi=100):
    return max(lo, min(hi, int(round(v))))


def make_scores(rng, country):
    _, geo, pol, env, esg = COUNTRIES[country]
    # Large established manufacturers: centre lower than the generic dataset
    base = clip(rng.gauss(34, 10), 10, 70)
    s = {f: clip(base + rng.gauss(0, 10)) for f in SCORE_FIELDS}
    # Location-driven scores mostly follow the country, partly the supplier
    s["Geopolitical_Risk_Score"] = clip(0.7 * geo + 0.3 * base + rng.gauss(0, 7))
    s["Political_Stability_Score"] = clip(0.7 * pol + 0.3 * base + rng.gauss(0, 7))
    s["Environmental_Exposure_Score"] = clip(0.7 * env + 0.3 * base + rng.gauss(0, 9))
    s["ESG_Performance_Score"] = clip((esg + base) / 2 + rng.gauss(0, 8))
    s["Credit_Rating_Score"] = clip(s["Financial_Health_Score"] + rng.gauss(0, 8))
    # Total Risk Index tracks the mean of the 18 categories, like the main dataset
    s[TRI] = clip(sum(s[f] for f in SCORE_FIELDS) / len(SCORE_FIELDS) + rng.randint(-3, 3))
    return s


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", default="data/brakes/source")
    parser.add_argument("--seed", type=int, default=11)
    args = parser.parse_args()
    rng = random.Random(args.seed)

    rows = []
    for i, (name, country, segments) in enumerate(COMPANIES):
        scores = make_scores(rng, country)
        row = {"supplierID": f"BRKR_{i + 1:04d}", "Supplier Name": name}
        for f in [TRI, *SCORE_FIELDS]:
            row[f] = scores[f]
            row[f"{f}_Level"] = level_of(scores[f])
        row["Purchase Order Volume (EUR)"] = f"{min(rng.lognormvariate(14.5, 1.0), 50_000_000):.2f}"
        row["Order Change Rate"] = f"{rng.uniform(2, 15):.2f}"
        row["Supplier Delivery Rating"] = f"{clip(rng.gauss(92, 4), 70, 100) - rng.random():.2f}"
        row["Order Confirmation Rate"] = f"{clip(rng.gauss(90, 6), 60, 100) - rng.random():.2f}"
        row["Sourcing Risk Level"] = rng.choice(["Low", "Medium", "High"])
        row["Supply Chain Complexity"] = rng.choice(["Moderate", "Complex"])
        row["Country"] = country
        row["Region"] = COUNTRIES[country][0]
        row["Brake Segments"] = "; ".join(segments)
        row["Data Status"] = "Simulated"
        rows.append(row)

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    with open(out / "real_brake_suppliers.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=BASE_COLUMNS + EXTRA_COLUMNS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    print(f"suppliers: {len(rows)} -> {out / 'real_brake_suppliers.csv'}")


if __name__ == "__main__":
    main()
