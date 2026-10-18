"""Generate the brake procurement evaluation dataset.

Reads the simulated brake supplier and offering CSVs and produces questions that
follow a sourcing process for brakes: discover suppliers, qualify them against
mandatory requirements, compare prices, apply a risk gate, recommend an award,
plan dual sourcing and brief the buyer. Catalog-level lookups, counts,
aggregations and unanswerable questions are added on top.

Ground truth is computed directly from the CSVs. Output is deterministic for a
given seed.

Usage:
    python3 data/brakes/scripts/generate_brake_procurement_eval.py --seed 42

Standard library only.
"""

import argparse
import csv
import json
import random
import statistics
from pathlib import Path

SCORE_FIELDS = {
    "Financial_Health_Score": "financial risk",
    "Credit_Rating_Score": "credit risk",
    "Compliance_Risk_Score": "legal and compliance risk",
    "Quality_Risk_Score": "quality risk",
    "Digital_Security_Score": "cyber security risk",
    "Labor_Stability_Score": "labor disruption risk",
    "Safety_Incident_Score": "safety risk",
    "Environmental_Exposure_Score": "natural hazard exposure",
    "ESG_Performance_Score": "ESG risk",
    "Operational_Resilience_Score": "operational risk",
    "Market_Sentiment_Score": "reputational risk",
    "Governance_Risk_Score": "governance risk",
    "Geopolitical_Risk_Score": "geopolitical risk",
    "Political_Stability_Score": "political instability risk",
    "Sub_Tier_Visibility_Score": "sub-tier supply chain risk",
    "Media_Sentiment_Score": "adverse media risk",
    "External_Intelligence_Score": "third-party intelligence risk",
    "Industry_Benchmark_Score": "risk relative to industry peers",
}
TRI = "Total_Risk_Index"
FH = "Financial_Health_Score"
GEO = "Geopolitical_Risk_Score"
PRICE = "Unit Price (EUR)"
MOQ = "MOQ (units)"
LEAD = "Lead Time (days)"
CAP = "Annual Capacity (units)"
SDR = "Supplier Delivery Rating"
PO = "Purchase Order Volume (EUR)"

RISK_GATE_TEXT = "Total Risk Index below 50 and Financial Health Score below 50"
MIN_PRICE_GAP = 0.05  # EUR; winners must lead by at least this much

# RFQ scenarios. Requirements are stated in every question so ground truth is unambiguous.
SCENARIOS = [
    {
        "id": "RFQ-01", "name": "passenger car disc brake pad RFQ",
        "product": "Disc brake pads", "volume": 1_500_000,
        "certs": ["IATF 16949", "ECE R90"], "copper_free": True, "max_lead": 50, "regions": None,
        "approved_only_variant": True,
    },
    {
        "id": "RFQ-02", "name": "regional train rail brake pad RFQ",
        "product": "Rail brake pads", "volume": 30_000,
        "certs": ["ISO/TS 22163"], "copper_free": False, "max_lead": 90, "regions": None,
        "approved_only_variant": False,
    },
    {
        "id": "RFQ-03", "name": "wind turbine yaw brake pad RFQ",
        "product": "Yaw brake pads", "volume": 15_000,
        "certs": ["ISO 14001"], "copper_free": False, "max_lead": 90, "regions": ["EU"],
        "approved_only_variant": True,
    },
    {
        "id": "RFQ-04", "name": "spring-applied brake RFQ for industrial drives",
        "product": "Spring-applied brakes", "volume": 10_000,
        "certs": ["ISO 9001", "ISO 14001"], "copper_free": False, "max_lead": 75, "regions": None,
        "approved_only_variant": False,
    },
    {
        "id": "RFQ-05", "name": "commercial vehicle air disc brake pad RFQ",
        "product": "Air disc brake pads", "volume": 400_000,
        "certs": ["IATF 16949"], "copper_free": False, "max_lead": 50, "regions": None,
        "approved_only_variant": False,
    },
    {
        "id": "RFQ-06", "name": "passenger car brake disc RFQ",
        "product": "Brake discs", "volume": 1_000_000,
        "certs": ["IATF 16949", "ECE R90"], "copper_free": False, "max_lead": 45, "regions": None,
        "approved_only_variant": True,
    },
]


# --------------------------------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------------------------------


def eur(v):
    return f"EUR {v:,.2f}"


def units(v):
    return f"{v:,}"


def article(word):
    return "an" if word[0].lower() in "aeiou" else "a"


def ids_text(ids):
    return ", ".join(ids) if ids else "none"


def load(source):
    with open(Path(source) / "brake_suppliers.csv", newline="", encoding="utf-8") as f:
        suppliers = {r["supplierID"]: r for r in csv.DictReader(f)}
    with open(Path(source) / "brake_offerings.csv", newline="", encoding="utf-8") as f:
        offerings = list(csv.DictReader(f))
    for s in suppliers.values():
        for k in [TRI, *SCORE_FIELDS]:
            s[k] = int(s[k])
        s["certs"] = [c for c in s["Certifications"].split("; ") if c]
        s[PO] = float(s[PO])
        s[SDR] = float(s[SDR]) if s[SDR] else None
    for o in offerings:
        o[PRICE] = float(o[PRICE])
        for k in [MOQ, LEAD, CAP]:
            o[k] = int(o[k])
    return suppliers, offerings


def requirement_text(sc):
    parts = [f"{' and '.join(sc['certs'])} certified"]
    if sc["copper_free"]:
        parts.append("copper-free")
    if sc["regions"]:
        parts.append(f"supplier located in the {' or '.join(sc['regions'])}")
    parts.append(f"lead time of {sc['max_lead']} days or less")
    parts.append(f"annual capacity of at least {units(sc['volume'])} units")
    return ", ".join(parts[:-1]) + " and " + parts[-1]


def failed_criteria(sc, o, s):
    failed = [f"missing {c}" for c in sc["certs"] if c not in s["certs"]]
    if sc["copper_free"] and o["Copper Free"] != "Yes":
        failed.append("not copper-free")
    if sc["regions"] and s["Region"] not in sc["regions"]:
        failed.append(f"located in {s['Region']} ({s['Country']})")
    if o[LEAD] > sc["max_lead"]:
        failed.append(f"lead time {o[LEAD]} days exceeds {sc['max_lead']}")
    if o[CAP] < sc["volume"]:
        failed.append(f"capacity {units(o[CAP])} below {units(sc['volume'])}")
    return failed


def passes_gate(s):
    return s[TRI] < 50 and s[FH] < 50


def gate_failures(s):
    out = []
    if s[TRI] >= 50:
        out.append(f"Total Risk Index {s[TRI]} ({s['Total_Risk_Index_Level']})")
    if s[FH] >= 50:
        out.append(f"Financial Health Score {s[FH]} ({s['Financial_Health_Score_Level']})")
    return out


def cheapest(offers):
    """Return the cheapest offer, or None if the top two are within MIN_PRICE_GAP."""
    ranked = sorted(offers, key=lambda o: o[PRICE])
    if not ranked:
        return None
    if len(ranked) > 1 and ranked[1][PRICE] - ranked[0][PRICE] < MIN_PRICE_GAP:
        return None
    return ranked[0]


def top_drivers(s, n=3):
    """Highest-scoring categories; shortened so the cut never falls inside a tie."""
    ranked = sorted(SCORE_FIELDS, key=lambda f: (-s[f], f))
    while n > 1 and s[ranked[n - 1]] == s[ranked[n]]:
        n -= 1
    return ranked[:n]


class Builder:
    def __init__(self):
        self.items = []

    def add(self, category, difficulty, question, answer, expected, evaluation, supplier_ids, fields,
            scenario=None, step=None, context=None):
        self.items.append({
            "id": f"BPE-{len(self.items) + 1:04d}",
            "category": category,
            "difficulty": difficulty,
            "scenario_id": scenario,
            "step": step,
            "context": context,
            "question": question,
            "ground_truth_answer": answer,
            "expected": expected,
            "evaluation": evaluation,
            "supplier_ids": supplier_ids,
            "fields": fields,
        })


# --------------------------------------------------------------------------------------------------
# Scenario questions
# --------------------------------------------------------------------------------------------------


def scenario_items(b, sc, suppliers, offerings):
    sid, name, product, vol = sc["id"], sc["name"], sc["product"], sc["volume"]
    offers = sorted([o for o in offerings if o["Product Type"] == product], key=lambda o: o["supplierID"])
    sup = lambda o: suppliers[o["supplierID"]]  # noqa: E731
    step = 0
    req = requirement_text(sc)
    # Lets each step be graded on its own, without the earlier turns of the conversation
    context = (f"{sc['id']}: {name} for {units(vol)} {product.lower()} per year. Mandatory requirements: {req}. "
               f"Risk gate: {RISK_GATE_TEXT}.")

    def add(category, difficulty, question, answer, expected, evaluation, ids, fields):
        nonlocal step
        step += 1
        b.add(category, difficulty, question, answer, expected, evaluation, ids, fields, sid, step, context)

    # 1. Discovery
    all_ids = [o["supplierID"] for o in offers]
    add("supplier_discovery", "easy",
        f"We are starting a {name} for {units(vol)} units per year. Which suppliers in our database offer {product.lower()}?",
        f"{len(all_ids)} suppliers offer {product.lower()}: {ids_text(all_ids)}.",
        {"ids": all_ids, "count": len(all_ids)}, {"method": "set_match"}, all_ids, ["Product Type"])

    # 2. Qualification
    qualified = [o for o in offers if not failed_criteria(sc, o, sup(o))]
    q_ids = [o["supplierID"] for o in qualified]
    add("qualification", "medium",
        f"For the {name} ({units(vol)} units per year), which suppliers meet all mandatory requirements: {req}?",
        f"{len(q_ids)} suppliers qualify: {ids_text(q_ids)}. All others fail at least one mandatory requirement.",
        {"ids": q_ids, "count": len(q_ids)}, {"method": "set_match"}, q_ids,
        ["Certifications", "Copper Free", "Region", LEAD, CAP])

    # 3. Disqualification reasons: one supplier failing a single criterion, one failing several
    rejected = [(o, failed_criteria(sc, o, sup(o))) for o in offers]
    rejected = [(o, f) for o, f in rejected if f]
    picks = [next(((o, f) for o, f in rejected if len(f) == 1), None),
             next(((o, f) for o, f in rejected if len(f) >= 2), None)]
    for pick in [p for p in picks if p]:
        o, f = pick
        s = sup(o)
        add("disqualification_reason", "medium",
            f"Why is {o['supplierID']} ({s['Supplier Name']}) not qualified for the {name}? Requirements: {req}.",
            f"{o['supplierID']} fails {len(f)} mandatory requirement(s): {'; '.join(f)}.",
            {"failed_criteria": f}, {"method": "rubric", "key_points": f}, [o["supplierID"]],
            ["Certifications", "Copper Free", "Region", LEAD, CAP])

    # 4-5. Lowest price and annual cost among qualified offers
    low = cheapest(qualified)
    if low:
        s = sup(low)
        add("price_comparison", "medium",
            f"Among the suppliers qualified for the {name}, who offers the lowest unit price?",
            f"{low['supplierID']} ({s['Supplier Name']}) offers the lowest qualified unit price at {eur(low[PRICE])}.",
            {"answer_id": low["supplierID"], "value": low[PRICE]}, {"method": "exact_match_id"},
            q_ids, [PRICE])
        cost = round(low[PRICE] * vol, 2)
        add("cost_calculation", "easy",
            f"What would the annual spend be if we bought all {units(vol)} units of the {name} from {low['supplierID']} at its quoted unit price?",
            f"{units(vol)} x {eur(low[PRICE])} = {eur(cost)} per year.",
            {"value": cost}, {"method": "numeric", "tolerance": {"abs": 1.0}}, [low["supplierID"]], [PRICE])

    # 6. Risk gate
    failing = [o for o in qualified if not passes_gate(sup(o))]
    f_ids = [o["supplierID"] for o in failing]
    detail = "; ".join(f"{o['supplierID']}: {', '.join(gate_failures(sup(o)))}" for o in failing)
    add("risk_gate", "medium",
        f"Our risk gate requires {RISK_GATE_TEXT}. Which of the suppliers qualified for the {name} fail the gate?",
        (f"{len(f_ids)} qualified supplier(s) fail the risk gate: {detail}." if f_ids
         else "None of the qualified suppliers fail the risk gate."),
        {"ids": f_ids, "count": len(f_ids)}, {"method": "set_match"}, q_ids, [TRI, FH])

    # 7. Award recommendation (cheapest qualified offer that passes the gate)
    cleared = [o for o in qualified if passes_gate(sup(o))]
    award = cheapest(cleared)
    if award:
        s = sup(award)
        key_points = [f"Recommends {award['supplierID']}", f"Unit price {eur(award[PRICE])}"]
        answer = (f"Award to {award['supplierID']} ({s['Supplier Name']}, {s['Country']}): the lowest unit price "
                  f"({eur(award[PRICE])}) among qualified suppliers that pass the risk gate "
                  f"(Total Risk Index {s[TRI]}, Financial Health Score {s[FH]}).")
        if low and low["supplierID"] != award["supplierID"]:
            lf = ", ".join(gate_failures(sup(low)))
            answer += f" The cheaper {low['supplierID']} ({eur(low[PRICE])}) is excluded by the risk gate: {lf}."
            key_points.append(f"Explains that {low['supplierID']} is cheaper but fails the risk gate")
        if s["Supplier Status"] == "Prospect":
            answer += " Note that it is a prospect with no order history, so onboarding is needed before award."
            key_points.append("Flags that the supplier is a prospect (not yet approved)")
        add("award_recommendation", "hard",
            f"Recommend a supplier for the {name}: choose the lowest unit price among qualified suppliers that pass the risk gate ({RISK_GATE_TEXT}).",
            answer, {"answer_id": award["supplierID"], "value": award[PRICE]},
            {"method": "exact_match_id", "key_points": key_points}, q_ids, [PRICE, TRI, FH, "Supplier Status"])

        # 8. Cost of the risk gate
        if low and low["supplierID"] != award["supplierID"]:
            premium = round((award[PRICE] - low[PRICE]) * vol, 2)
            add("cost_calculation", "medium",
                f"How much more per year does the risk-cleared award ({award['supplierID']}) cost compared with the cheapest qualified offer ({low['supplierID']}) for {units(vol)} units?",
                f"({eur(award[PRICE])} - {eur(low[PRICE])}) x {units(vol)} = {eur(premium)} per year.",
                {"value": premium}, {"method": "numeric", "tolerance": {"abs": 1.0}},
                [award["supplierID"], low["supplierID"]], [PRICE])

        # 9. Approved-only variant
        if sc["approved_only_variant"]:
            approved = [o for o in cleared if sup(o)["Supplier Status"] == "Approved"]
            alt = cheapest(approved)
            if alt and alt["supplierID"] != award["supplierID"]:
                a = sup(alt)
                add("award_recommendation", "hard",
                    f"Onboarding a new supplier is not possible in time for the {name}. Which approved supplier should we award: qualified, passing the risk gate ({RISK_GATE_TEXT}), lowest unit price?",
                    f"Award to {alt['supplierID']} ({a['Supplier Name']}, {a['Country']}) at {eur(alt[PRICE])}. "
                    f"{award['supplierID']} is cheaper but is a prospect, not an approved supplier.",
                    {"answer_id": alt["supplierID"], "value": alt[PRICE]},
                    {"method": "exact_match_id",
                     "key_points": [f"Recommends {alt['supplierID']}", f"Excludes prospect {award['supplierID']}"]},
                    [alt["supplierID"], award["supplierID"]], [PRICE, "Supplier Status", TRI, FH])

        # 10. MOQ check against monthly call-offs
        monthly = vol // 12
        fits = award[MOQ] <= monthly
        add("moq_check", "easy",
            f"We plan monthly call-offs of {units(monthly)} units for the {name}. Does that meet the minimum order quantity of {award['supplierID']}?",
            f"{'Yes' if fits else 'No'}. The MOQ of {award['supplierID']} is {units(award[MOQ])} units, "
            f"{'below or equal to' if fits else 'above'} the monthly call-off of {units(monthly)}.",
            {"value": "Yes" if fits else "No", "moq": award[MOQ]}, {"method": "exact_match"},
            [award["supplierID"]], [MOQ])

        # 11. Supplier briefing for the award
        drivers = top_drivers(s)
        perf = (f"Delivery rating {s[SDR]:.2f}%." if s[SDR] is not None
                else "No delivery history (prospect).")
        add("award_briefing", "hard",
            f"Give me a short risk briefing on {award['supplierID']} before we negotiate the {name}.",
            f"{award['supplierID']} ({s['Supplier Name']}) is based in {s['Country']} ({s['Supplier Status']}). "
            f"Total Risk Index {s[TRI]} ({s['Total_Risk_Index_Level']}). Highest risk areas: "
            + ", ".join(f"{d.replace('_', ' ')} {s[d]} ({s[d + '_Level']})" for d in drivers)
            + f". Certifications: {', '.join(s['certs']) or 'none'}. {perf}",
            {"country": s["Country"], "status": s["Supplier Status"], "total_risk_index": s[TRI],
             "top_drivers": drivers},
            {"method": "rubric", "key_points": [
                f"Country {s['Country']}", f"Total Risk Index {s[TRI]} ({s['Total_Risk_Index_Level']})",
                f"Names the top risk areas: {', '.join(d.replace('_', ' ') for d in drivers)}",
                "Delivery rating stated" if s[SDR] is not None else "States there is no delivery history"]},
            [award["supplierID"]], [TRI, *drivers, SDR, "Country", "Certifications"])

    # 12. Dual sourcing: 70/30 split across the two cheapest risk-cleared offers
    ranked = sorted(cleared, key=lambda o: o[PRICE])
    if len(ranked) >= 2 and (len(ranked) < 3 or ranked[2][PRICE] - ranked[1][PRICE] >= MIN_PRICE_GAP) \
            and ranked[1][PRICE] - ranked[0][PRICE] >= MIN_PRICE_GAP:
        first, second = ranked[0], ranked[1]
        v1, v2 = round(vol * 0.7), vol - round(vol * 0.7)
        cost = round(first[PRICE] * v1 + second[PRICE] * v2, 2)
        add("dual_sourcing", "hard",
            f"For resilience we want to dual-source the {name}: 70% to the cheapest and 30% to the second-cheapest qualified supplier passing the risk gate ({RISK_GATE_TEXT}). Who are they, and what is the total annual cost?",
            f"70% ({units(v1)} units) to {first['supplierID']} at {eur(first[PRICE])} and 30% ({units(v2)} units) to "
            f"{second['supplierID']} at {eur(second[PRICE])}. Total annual cost {eur(cost)}.",
            {"ids_ordered": [first["supplierID"], second["supplierID"]], "value": cost},
            {"method": "numeric", "tolerance": {"abs": 1.0},
             "key_points": [f"Primary {first['supplierID']}", f"Secondary {second['supplierID']}"]},
            [first["supplierID"], second["supplierID"]], [PRICE, TRI, FH])

    # 13. Out-of-scope question for the same RFQ
    add("unanswerable", "medium",
        f"What is the landed cost per unit, including freight and import duties, for the {name} from the cheapest qualified supplier?",
        "The database has quoted unit prices only. Freight, Incoterms and import duties are not available, so landed cost cannot be calculated without that data.",
        {"value": None}, {"method": "refusal"}, [], [PRICE])


# --------------------------------------------------------------------------------------------------
# Catalog questions
# --------------------------------------------------------------------------------------------------


def catalog_items(b, rng, suppliers, offerings):
    sup = lambda o: suppliers[o["supplierID"]]  # noqa: E731
    offer_fields = [(PRICE, "unit price", lambda v: eur(v), {"abs": 0.01}),
                    (LEAD, "lead time", lambda v: f"{v} days", {"abs": 0}),
                    (MOQ, "minimum order quantity", lambda v: f"{units(v)} units", {"abs": 0}),
                    (CAP, "annual capacity", lambda v: f"{units(v)} units", {"abs": 0})]

    # Offering lookups
    for o in rng.sample(offerings, 10):
        field, label, fmt, tol = rng.choice(offer_fields)
        b.add("offering_lookup", "easy",
              f"What is the {label} of {o['supplierID']} for {o['Product Type'].lower()}?",
              f"{o['supplierID']} ({sup(o)['Supplier Name']}) quotes {article(label)} {label} of {fmt(o[field])} for {o['Product Type'].lower()}.",
              {"value": o[field]}, {"method": "numeric", "tolerance": tol}, [o["supplierID"]], [field])

    # Supplier lookups: country, status, overall risk
    for s in rng.sample(sorted(suppliers.values(), key=lambda s: s["supplierID"]), 6):
        kind = rng.choice(["country", "risk", "certs"])
        if kind == "country":
            b.add("supplier_lookup", "easy", f"Where is {s['Supplier Name']} located?",
                  f"{s['Supplier Name']} ({s['supplierID']}) is located in {s['Country']} ({s['Region']}).",
                  {"value": s["Country"]}, {"method": "exact_match"}, [s["supplierID"]], ["Country"])
        elif kind == "risk":
            b.add("supplier_lookup", "easy", f"What is the overall risk score of brake supplier {s['supplierID']}?",
                  f"{s['supplierID']} has a Total Risk Index of {s[TRI]} ({s['Total_Risk_Index_Level']}; 0 = no risk, 100 = maximum risk).",
                  {"value": s[TRI], "level": s["Total_Risk_Index_Level"]}, {"method": "exact_match"},
                  [s["supplierID"]], [TRI])
        else:
            b.add("supplier_lookup", "easy", f"Which certifications does {s['supplierID']} hold?",
                  f"{s['supplierID']} holds: {', '.join(s['certs']) or 'no certifications on record'}.",
                  {"values": s["certs"]}, {"method": "set_match"}, [s["supplierID"]], ["Certifications"])

    # Certification checks (yes/no), including a supplier with no certifications if present
    picks = rng.sample(sorted(suppliers.values(), key=lambda s: s["supplierID"]), 5)
    for s in picks:
        cert = rng.choice(["IATF 16949", "ISO 14001", "ISO/TS 22163", "ECE R90", "ISO 45001"])
        has = cert in s["certs"]
        b.add("cert_check", "easy", f"Is {s['supplierID']} {cert} certified?",
              f"{'Yes' if has else 'No'}. {s['supplierID']} holds: {', '.join(s['certs']) or 'no certifications on record'}.",
              {"value": "Yes" if has else "No"}, {"method": "exact_match"}, [s["supplierID"]], ["Certifications"])

    # Counts
    count_specs = [
        ("How many brake suppliers in our database are located in Germany?",
         lambda: [s for s in suppliers.values() if s["Country"] == "Germany"], "supplier"),
        ("How many brake suppliers are prospects with no order history yet?",
         lambda: [s for s in suppliers.values() if s["Supplier Status"] == "Prospect"], "supplier"),
        ("How many brake suppliers hold ISO/TS 22163 (rail quality) certification?",
         lambda: [s for s in suppliers.values() if "ISO/TS 22163" in s["certs"]], "supplier"),
        ("How many brake suppliers are based outside the EU?",
         lambda: [s for s in suppliers.values() if s["Region"] != "EU"], "supplier"),
        ("How many copper-free friction product offerings (pads and blocks) are in the catalog?",
         lambda: [o for o in offerings if o["Copper Free"] == "Yes"], "offering"),
        ("How many offerings are for rail applications?",
         lambda: [o for o in offerings if o["Application"] == "Rail"], "offering"),
        ("How many approved brake suppliers have a High or Critical Total Risk Index?",
         lambda: [s for s in suppliers.values() if s["Supplier Status"] == "Approved" and s[TRI] >= 50], "supplier"),
        ("How many brake suppliers offer products for more than one application (for example both rail and wind)?",
         lambda: [sid for sid in suppliers
                  if len({o["Application"] for o in offerings if o["supplierID"] == sid}) > 1], "supplier"),
    ]
    for question, fn, kind in count_specs:
        rows = fn()
        ids = sorted({r if isinstance(r, str) else r["supplierID"] for r in rows})
        b.add("count", "medium", question, f"{len(rows)} {kind}{'s' if len(rows) != 1 else ''}.",
              {"value": len(rows), "ids": ids}, {"method": "numeric", "tolerance": {"abs": 0}}, ids, [])

    # Aggregations
    products = sorted({o["Product Type"] for o in offerings})
    for product in rng.sample(products, 3):
        prices = [o[PRICE] for o in offerings if o["Product Type"] == product]
        avg = round(statistics.mean(prices), 2)
        b.add("aggregation", "medium", f"What is the average quoted unit price for {product.lower()} across all suppliers?",
              f"The average unit price across {len(prices)} offers is {eur(avg)} (range {eur(min(prices))} to {eur(max(prices))}).",
              {"value": avg}, {"method": "numeric", "tolerance": {"abs": 0.01}}, [], [PRICE])
    for product in rng.sample(products, 2):
        leads = [o[LEAD] for o in offerings if o["Product Type"] == product]
        med = statistics.median(leads)
        b.add("aggregation", "medium", f"What is the median lead time for {product.lower()}?",
              f"The median lead time across {len(leads)} offers is {med:g} days.",
              {"value": med}, {"method": "numeric", "tolerance": {"abs": 0.5}}, [], [LEAD])
    eu_spend = round(sum(s[PO] for s in suppliers.values() if s["Region"] == "EU"), 2)
    b.add("aggregation", "medium", "What is our total purchase order volume with EU-based brake suppliers?",
          f"Total purchase order volume with EU-based brake suppliers is {eur(eu_spend)}.",
          {"value": eu_spend}, {"method": "numeric", "tolerance": {"rel": 0.001}}, [], [PO, "Region"])

    # Geopolitical screening per application
    for app in ["Passenger car", "Rail", "Wind turbine", "Commercial vehicle"]:
        hits = sorted({o["supplierID"] for o in offerings
                       if o["Application"] == app and sup(o)[GEO] >= 50})
        b.add("geo_risk_screen", "medium",
              f"Which {app.lower()} brake suppliers have a High or Critical Geopolitical Risk Score (50 or above)?",
              (f"{len(hits)} supplier(s): " + "; ".join(f"{i} ({suppliers[i]['Country']}, {suppliers[i][GEO]})" for i in hits) + "."
               if hits else "None."),
              {"ids": hits, "count": len(hits)}, {"method": "set_match"}, hits, [GEO, "Application"])

    # Delivery performance: approved suppliers have a rating, prospects do not
    approved = sorted([s for s in suppliers.values() if s["Supplier Status"] == "Approved"], key=lambda s: s["supplierID"])
    prospects = sorted([s for s in suppliers.values() if s["Supplier Status"] == "Prospect"], key=lambda s: s["supplierID"])
    for s in rng.sample(approved, 2):
        b.add("performance_lookup", "easy", f"What is the delivery rating of {s['supplierID']}?",
              f"{s['supplierID']} has a Supplier Delivery Rating of {s[SDR]:.2f}%.",
              {"value": s[SDR]}, {"method": "numeric", "tolerance": {"abs": 0.01}}, [s["supplierID"]], [SDR])
    for s in rng.sample(prospects, 2):
        b.add("unanswerable", "medium", f"What is the on-time delivery rating of {s['supplierID']}?",
              f"{s['supplierID']} is a prospect with no order history, so there is no delivery rating. Its risk scores are available (Total Risk Index {s[TRI]}).",
              {"value": None}, {"method": "refusal"}, [s["supplierID"]], [SDR, "Supplier Status"])

    # Questions the data cannot answer
    ex = rng.choice(offerings)
    unanswerable = [
        f"What is the friction coefficient of the {ex['Product Type'].lower()} from {ex['supplierID']}?",
        "Which brake supplier will raise prices next year?",
        f"Has {ex['supplierID']} passed PPAP for our latest part number?",
        "What tooling costs should we expect for a new brake caliper design?",
        "Which suppliers offer carbon-ceramic brake discs?",
        "Who supplies ABS sensors in our database?",
        "What is the delivery rating of BRK_0999?",
        f"What payment terms did we agree with {ex['supplierID']}?",
    ]
    reasons = [
        "Technical test data such as friction coefficients is not in the database.",
        "The database has no price forecasts; predicting future price changes would be speculation.",
        "PPAP and part approval status are not tracked in the database.",
        "Tooling costs are not in the database; only unit price, MOQ, lead time and capacity are quoted.",
        "No offering uses carbon-ceramic material; brake discs in the catalog are grey or high-carbon cast iron.",
        "The catalog only covers brakes; ABS sensors are not included.",
        "BRK_0999 does not exist; brake supplier IDs run from BRK_0001 to BRK_" + f"{len(suppliers):04d}.",
        "Contract and payment terms are not stored in the database.",
    ]
    for q, r in zip(unanswerable, reasons):
        b.add("unanswerable", "medium", q, r, {"value": None}, {"method": "refusal"}, [], [])

    # Interpretation traps: scores are risk scores (higher = worse)
    for s in rng.sample(sorted(suppliers.values(), key=lambda s: s["supplierID"]), 3):
        f = rng.choice([FH, "Quality_Risk_Score", "ESG_Performance_Score"])
        label = f.replace("_", " ")
        b.add("interpretation", "medium",
              f"{s['supplierID']} has {article(label)} {label} of {s[f]}. Is that good?",
              f"All scores are risk scores (0 = no risk, 100 = maximum risk). {s[f]} is {s[f + '_Level']} risk, "
              f"so {'that is favourable' if s[f] < 25 else 'it is acceptable but worth monitoring' if s[f] < 50 else 'it is a concern'}.",
              {"value": s[f], "level": s[f + "_Level"]},
              {"method": "rubric", "key_points": ["States higher score = higher risk", f"Level {s[f + '_Level']}"]},
              [s["supplierID"]], [f])


# --------------------------------------------------------------------------------------------------
# Output
# --------------------------------------------------------------------------------------------------


def write(items, out):
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out.with_suffix(".jsonl"), "w", encoding="utf-8") as f:
        for it in items:
            f.write(json.dumps(it, ensure_ascii=False) + "\n")
    cols = ["id", "category", "difficulty", "scenario_id", "step", "context", "question", "ground_truth_answer",
            "evaluation_method", "expected", "key_points", "supplier_ids", "fields"]
    with open(out.with_suffix(".csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(cols)
        for it in items:
            w.writerow([it["id"], it["category"], it["difficulty"], it["scenario_id"] or "", it["step"] or "",
                        it["context"] or "", it["question"], it["ground_truth_answer"], it["evaluation"]["method"],
                        json.dumps(it["expected"], ensure_ascii=False),
                        " | ".join(it["evaluation"].get("key_points", [])),
                        ";".join(it["supplier_ids"]), ";".join(it["fields"])])


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--source", default="data/brakes/source")
    parser.add_argument("--out", default="data/brakes/brake_procurement_eval_v1")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    suppliers, offerings = load(args.source)
    rng = random.Random(args.seed)
    b = Builder()
    for sc in SCENARIOS:
        scenario_items(b, sc, suppliers, offerings)
    catalog_items(b, rng, suppliers, offerings)
    write(b.items, args.out)

    counts = {}
    for it in b.items:
        counts[it["category"]] = counts.get(it["category"], 0) + 1
    print(f"{len(b.items)} items -> {args.out}.jsonl / .csv")
    for k, v in sorted(counts.items(), key=lambda kv: -kv[1]):
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
