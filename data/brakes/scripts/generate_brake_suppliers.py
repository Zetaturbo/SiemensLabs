"""Generate a simulated brake supplier dataset.

Produces fictional brake manufacturers with the same 46 columns as the main
supplier risk dataset (18 risk scores with levels, Total Risk Index and
operational KPIs), plus brake-specific attributes:

  brake_suppliers.csv   one row per supplier: scores, KPIs, country, region,
                        status (Approved / Prospect), certifications
  brake_offerings.csv   one row per product offering: product type,
                        application, material, copper-free flag, unit price,
                        MOQ, lead time, annual capacity

All company names are invented. Output is deterministic for a given seed.

Usage:
    python3 data/brakes/scripts/generate_brake_suppliers.py --seed 7

Standard library only.
"""

import argparse
import csv
import random
from fractions import Fraction
from pathlib import Path

N_SUPPLIERS = 60

SCORE_FIELDS = [
    "Industry_Benchmark_Score", "Media_Sentiment_Score", "External_Intelligence_Score",
    "Sub_Tier_Visibility_Score", "Labor_Stability_Score", "Financial_Health_Score",
    "Compliance_Risk_Score", "Safety_Incident_Score", "Environmental_Exposure_Score",
    "ESG_Performance_Score", "Digital_Security_Score", "Operational_Resilience_Score",
    "Market_Sentiment_Score", "Quality_Risk_Score", "Governance_Risk_Score",
    "Geopolitical_Risk_Score", "Political_Stability_Score", "Credit_Rating_Score",
]
TRI = "Total_Risk_Index"

# Official Total Risk Index weights (api/supplier_api/catalog.py OFFICIAL_WEIGHTS), in percent
OFFICIAL_WEIGHTS = {
    "Operational_Resilience_Score": 10, "Financial_Health_Score": 10, "Quality_Risk_Score": 10,
    "Compliance_Risk_Score": 8, "Credit_Rating_Score": 6, "Safety_Incident_Score": 6,
    "Sub_Tier_Visibility_Score": 6, "Geopolitical_Risk_Score": 5, "Governance_Risk_Score": 5,
    "ESG_Performance_Score": 5, "Labor_Stability_Score": 4, "Environmental_Exposure_Score": 4,
    "Digital_Security_Score": 4, "Industry_Benchmark_Score": 4, "Political_Stability_Score": 4,
    "Market_Sentiment_Score": 3, "Media_Sentiment_Score": 3, "External_Intelligence_Score": 3,
}

# Same column order as data/eval/source/supplier_risk_data.csv, then the brake attributes
BASE_COLUMNS = ["supplierID", "Supplier Name"]
for _f in [TRI, *SCORE_FIELDS]:
    BASE_COLUMNS += [_f, f"{_f}_Level"]
BASE_COLUMNS += [
    "Purchase Order Volume (EUR)", "Order Change Rate", "Supplier Delivery Rating",
    "Order Confirmation Rate", "Sourcing Risk Level", "Supply Chain Complexity",
]
EXTRA_COLUMNS = ["Country", "Region", "Supplier Status", "Certifications"]
OFFERING_COLUMNS = [
    "offeringID", "supplierID", "Commodity", "Product Type", "Application", "Material",
    "Copper Free", "Unit Price (EUR)", "MOQ (units)", "Lead Time (days)", "Annual Capacity (units)",
]

# country: (region, legal suffix, geopolitical base, political base, environmental base, ESG base)
COUNTRIES = {
    "Germany": ("EU", "GmbH", 15, 12, 20, 25),
    "Czech Republic": ("EU", "s.r.o.", 20, 18, 18, 32),
    "Poland": ("EU", "Sp. z o.o.", 25, 22, 15, 35),
    "Italy": ("EU", "S.p.A.", 22, 28, 38, 30),
    "Spain": ("EU", "S.L.", 20, 24, 30, 30),
    "France": ("EU", "SAS", 18, 24, 22, 27),
    "Sweden": ("EU", "AB", 10, 8, 12, 18),
    "United Kingdom": ("Europe (non-EU)", "Ltd", 18, 22, 18, 28),
    "Turkey": ("Europe (non-EU)", "A.S.", 58, 60, 55, 50),
    "United States": ("North America", "Inc.", 22, 30, 40, 38),
    "Mexico": ("North America", "S.A. de C.V.", 48, 50, 45, 48),
    "Brazil": ("South America", "Ltda.", 45, 52, 40, 45),
    "China": ("Asia-Pacific", "Co., Ltd.", 62, 45, 50, 55),
    "India": ("Asia-Pacific", "Pvt. Ltd.", 50, 45, 62, 55),
    "Japan": ("Asia-Pacific", "K.K.", 20, 15, 72, 28),
    "South Korea": ("Asia-Pacific", "Co., Ltd.", 35, 25, 35, 35),
    "Thailand": ("Asia-Pacific", "Co., Ltd.", 42, 55, 58, 48),
}

# Where each segment's suppliers tend to be located (country: weight)
SEGMENT_COUNTRIES = {
    "Passenger car": {"Germany": 4, "Czech Republic": 3, "Poland": 3, "Italy": 2, "Spain": 2, "Turkey": 2,
                      "Mexico": 2, "China": 3, "India": 2, "Japan": 2, "South Korea": 2, "United States": 2,
                      "Thailand": 1, "Brazil": 1},
    "Commercial vehicle": {"Germany": 3, "Sweden": 2, "Poland": 2, "Turkey": 2, "India": 2, "China": 2,
                           "United States": 2, "Brazil": 1},
    "Rail": {"Germany": 4, "France": 3, "Italy": 2, "Czech Republic": 2, "Sweden": 1, "United Kingdom": 2,
             "Spain": 1, "China": 2, "India": 1, "Japan": 1},
    "Industrial": {"Germany": 4, "Italy": 2, "United Kingdom": 1, "United States": 2, "China": 2, "Czech Republic": 1},
    "Wind turbine": {"Germany": 3, "Spain": 2, "Sweden": 1, "Italy": 1, "China": 3, "India": 2, "United States": 1},
}
SEGMENT_WEIGHTS = {"Passenger car": 22, "Commercial vehicle": 8, "Rail": 14, "Industrial": 8, "Wind turbine": 8}

# product type: (application, materials, friction product?, price EUR, MOQ, lead time days, capacity units/yr)
PRODUCTS = {
    "Disc brake pads": ("Passenger car", ["Low-metallic", "Ceramic", "NAO organic"], True,
                        (3.5, 12.0), (2000, 20000), (20, 60), (500_000, 6_000_000)),
    "Brake discs": ("Passenger car", ["Grey cast iron", "High-carbon cast iron"], False,
                    (12.0, 45.0), (1000, 10000), (25, 70), (200_000, 3_000_000)),
    "Brake calipers": ("Passenger car", ["Cast iron", "Aluminium"], False,
                       (35.0, 140.0), (500, 5000), (35, 90), (100_000, 2_000_000)),
    "Air disc brake pads": ("Commercial vehicle", ["Low-metallic", "Semi-metallic"], True,
                            (15.0, 45.0), (1000, 10000), (25, 60), (100_000, 1_500_000)),
    "Drum brake assemblies": ("Commercial vehicle", ["Grey cast iron"], False,
                              (60.0, 180.0), (200, 2000), (30, 80), (20_000, 300_000)),
    "Rail brake pads": ("Rail", ["Sintered", "Organic composite"], True,
                        (80.0, 260.0), (100, 1500), (45, 120), (10_000, 200_000)),
    "Composite brake blocks": ("Rail", ["Organic composite"], True,
                               (25.0, 70.0), (500, 5000), (40, 100), (20_000, 400_000)),
    "Rail brake discs": ("Rail", ["Cast steel", "Forged steel"], False,
                         (900.0, 2600.0), (20, 300), (60, 150), (1_000, 20_000)),
    "Spring-applied brakes": ("Industrial", ["Electromagnetic"], False,
                              (120.0, 900.0), (50, 1000), (30, 90), (5_000, 100_000)),
    "Hydraulic caliper brakes": ("Industrial", ["Hydraulic"], False,
                                 (400.0, 2200.0), (10, 200), (45, 120), (1_000, 30_000)),
    "Yaw brake pads": ("Wind turbine", ["Organic composite", "Sintered"], True,
                       (40.0, 150.0), (100, 2000), (40, 110), (5_000, 80_000)),
    "Rotor brake calipers": ("Wind turbine", ["Hydraulic"], False,
                             (1500.0, 6000.0), (5, 100), (60, 160), (200, 5_000)),
}

NAME_STEMS = [
    "Veltrix", "Norbrake", "Halcyra", "Brennholt", "Quarvon", "Stelvar", "Ardenfield", "Corvelle",
    "Tessmark", "Ombrix", "Kaldren", "Fennic", "Lumora", "Ravensholt", "Seltra", "Virexa", "Draxholm",
    "Pellwin", "Morvane", "Zentrik", "Aubrecht", "Calvisto", "Dremont", "Eskvale", "Gravik", "Hollmer",
    "Istrova", "Jandrel", "Korvath", "Lindqvar", "Marrowind", "Nyquell", "Orsenna", "Pradova", "Quillon",
    "Rothwell", "Sandvara", "Torvane", "Ulmbrook", "Vantrel", "Westrach", "Yorvell", "Zabrisk", "Albrind",
    "Bexhollow", "Cindral", "Dunmore", "Elvanta", "Fjordell", "Grantis", "Harkvale", "Iverno", "Jessmar",
    "Kestrova", "Lorvane", "Mendrix", "Novalis", "Oskarth", "Parvelle", "Rendavo",
]
NAME_CORES = {
    "Passenger car": ["Friction", "Brake Systems", "Automotive Components", "Braking Technologies"],
    "Commercial vehicle": ["Heavy Duty Brakes", "Brake Systems", "Commercial Braking"],
    "Rail": ["Rail Braking", "Rail Components", "Friction Rail", "Railway Brakes"],
    "Industrial": ["Motion Control", "Industrial Brakes", "Drive Brakes"],
    "Wind turbine": ["Wind Braking", "Energy Brakes", "Turbine Components"],
}

LEVELS = [(75, "Critical"), (50, "High"), (25, "Medium"), (0, "Low")]


def level_of(score):
    return next(name for cut, name in LEVELS if score >= cut)


def clip(v, lo=0, hi=100):
    return max(lo, min(hi, int(round(v))))


def weighted(rng, weights):
    keys = list(weights)
    return rng.choices(keys, weights=[weights[k] for k in keys])[0]


def round_to(v, step):
    return int(round(v / step) * step)


def make_scores(rng, country):
    _, _, geo, pol, env, esg = COUNTRIES[country]
    base = clip(rng.gauss(42, 17), 8, 90)
    s = {f: clip(base + rng.gauss(0, 10)) for f in SCORE_FIELDS}
    # Location-driven scores mostly follow the country, partly the supplier
    s["Geopolitical_Risk_Score"] = clip(0.7 * geo + 0.3 * base + rng.gauss(0, 7))
    s["Political_Stability_Score"] = clip(0.7 * pol + 0.3 * base + rng.gauss(0, 7))
    s["Environmental_Exposure_Score"] = clip(0.7 * env + 0.3 * base + rng.gauss(0, 9))
    s["ESG_Performance_Score"] = clip((esg + base) / 2 + rng.gauss(0, 8))
    s["Credit_Rating_Score"] = clip(s["Financial_Health_Score"] + rng.gauss(0, 8))
    return s


def finalize_scores(rng, s):
    # Same exact rule as the main dataset: round half to even of the official weighted sum
    s[TRI] = round(sum(Fraction(w, 100) * s[f] for f, w in OFFICIAL_WEIGHTS.items()))
    rng.randint(-3, 3)  # Former noise draw, kept so every other generated value stays the same
    return s


def make_certs(rng, segments):
    certs = []
    if rng.random() < 0.95:
        certs.append("ISO 9001")
    if segments & {"Passenger car", "Commercial vehicle"} and rng.random() < 0.8:
        certs.append("IATF 16949")
    if "Passenger car" in segments and rng.random() < 0.7:
        certs.append("ECE R90")
    if "Rail" in segments and rng.random() < 0.75:
        certs.append("ISO/TS 22163")
    if rng.random() < 0.6:
        certs.append("ISO 14001")
    if rng.random() < 0.45:
        certs.append("ISO 45001")
    return certs


def make_offering(rng, supplier_id, n, product):
    application, materials, friction, price, moq, lead, cap = PRODUCTS[product]
    p = rng.uniform(*price)
    return {
        "offeringID": f"{supplier_id}-{n:02d}",
        "supplierID": supplier_id,
        "Commodity": "Brakes",
        "Product Type": product,
        "Application": application,
        "Material": rng.choice(materials),
        "Copper Free": ("Yes" if rng.random() < 0.65 else "No") if friction else "",
        "Unit Price (EUR)": f"{p:.2f}",
        "MOQ (units)": round_to(rng.uniform(*moq), 10 if moq[1] <= 300 else 100),
        "Lead Time (days)": rng.randint(*lead),
        "Annual Capacity (units)": round_to(rng.uniform(*cap), 100 if cap[1] <= 20_000 else 1000),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out", default="data/brakes/source")
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args()
    rng = random.Random(args.seed)

    stems = rng.sample(NAME_STEMS, N_SUPPLIERS)
    suppliers, offerings = [], []
    for i in range(N_SUPPLIERS):
        sid = f"BRK_{i + 1:04d}"
        segment = weighted(rng, SEGMENT_WEIGHTS)
        country = weighted(rng, SEGMENT_COUNTRIES[segment])
        region, suffix = COUNTRIES[country][:2]

        seg_products = [p for p, spec in PRODUCTS.items() if spec[0] == segment]
        products = rng.sample(seg_products, rng.randint(1, min(3, len(seg_products))))
        if rng.random() < 0.2:
            other = [p for p in PRODUCTS if p not in products and PRODUCTS[p][0] != segment]
            products.append(rng.choice(other))
        segments = {PRODUCTS[p][0] for p in products}

        scores = finalize_scores(rng, make_scores(rng, country))
        status = "Prospect" if rng.random() < 0.25 else "Approved"
        row = {"supplierID": sid, "Supplier Name": f"{stems[i]} {rng.choice(NAME_CORES[segment])} {suffix}"}
        for f in [TRI, *SCORE_FIELDS]:
            row[f] = scores[f]
            row[f"{f}_Level"] = level_of(scores[f])
        if status == "Approved":
            row["Purchase Order Volume (EUR)"] = f"{min(rng.lognormvariate(13.5, 1.2), 50_000_000):.2f}"
            row["Order Change Rate"] = f"{rng.uniform(2, 20):.2f}"
            row["Supplier Delivery Rating"] = f"{clip(rng.gauss(90, 6), 60, 100) - rng.random():.2f}"
            row["Order Confirmation Rate"] = f"{clip(rng.gauss(88, 8), 55, 100) - rng.random():.2f}"
        else:
            # Prospects have no order history yet
            row["Purchase Order Volume (EUR)"] = "0.00"
            row["Order Change Rate"] = row["Supplier Delivery Rating"] = row["Order Confirmation Rate"] = ""
        row["Sourcing Risk Level"] = rng.choice(["Low", "Medium", "High"])
        row["Supply Chain Complexity"] = rng.choice(["Simple", "Moderate", "Complex"])
        row["Country"] = country
        row["Region"] = region
        row["Supplier Status"] = status
        row["Certifications"] = "; ".join(make_certs(rng, segments))
        suppliers.append(row)
        offerings += [make_offering(rng, sid, n + 1, p) for n, p in enumerate(products)]

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    for name, columns, rows in [
        ("brake_suppliers.csv", BASE_COLUMNS + EXTRA_COLUMNS, suppliers),
        ("brake_offerings.csv", OFFERING_COLUMNS, offerings),
    ]:
        with open(out / name, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=columns, lineterminator="\n")
            writer.writeheader()
            writer.writerows(rows)
    print(f"suppliers: {len(suppliers)}, offerings: {len(offerings)} -> {out}")


if __name__ == "__main__":
    main()
