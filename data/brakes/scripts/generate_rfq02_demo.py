"""Generate the RFQ-02 live demo items (data/brakes/demo/rfq02_demo_v1.jsonl).

Nine questions in demo order for the rail brake pad RFQ, computed from the brake CSVs, in the same
JSONL schema as brake_procurement_eval_v1. Asserts the facts the demo story depends on.

Usage:
    python3 data/brakes/scripts/generate_rfq02_demo.py data/brakes

Standard library only.
"""

import csv, json, sys
root = sys.argv[1] if len(sys.argv) > 1 else "data/brakes"
S = {r["supplierID"]: r for r in csv.DictReader(open(f"{root}/source/brake_suppliers.csv"))}
O = [r for r in csv.DictReader(open(f"{root}/source/brake_offerings.csv")) if r["Product Type"] == "Rail brake pads"]
VOL, LEAD, CERT = 30000, 90, "ISO/TS 22163"
p = lambda o: float(o["Unit Price (EUR)"])
tri = lambda i: int(S[i]["Total_Risk_Index"]); fh = lambda i: int(S[i]["Financial_Health_Score"])
certs = lambda i: [c for c in S[i]["Certifications"].split("; ") if c]
eur = lambda v: f"EUR {v:,.2f}"
ok = lambda o: CERT in certs(o["supplierID"]) and int(o["Lead Time (days)"]) <= LEAD and int(o["Annual Capacity (units)"]) >= VOL
allids = sorted(o["supplierID"] for o in O)
q = sorted([o for o in O if ok(o)], key=p); qids = sorted(o["supplierID"] for o in q)
gate = [o for o in q if tri(o["supplierID"]) < 50 and fh(o["supplierID"]) < 50]
low, award, second = q[0], gate[0], gate[1]
L, A, B = low["supplierID"], award["supplierID"], second["supplierID"]
x9 = next(o for o in O if o["supplierID"] == "BRK_0009")
assert CERT in certs("BRK_0009") and int(x9["Annual Capacity (units)"]) >= VOL and int(x9["Lead Time (days)"]) > LEAD
assert min(O, key=p)["supplierID"] == "BRK_0009"
fails = [o["supplierID"] for o in q if o not in gate]
v1, v2 = 21000, 9000
dual = round(p(award)*v1 + p(second)*v2, 2); single = round(p(award)*VOL, 2)
assert int(award["Annual Capacity (units)"]) >= v1 and int(second["Annual Capacity (units)"]) >= v2
SCORES = [k for k in S[A] if k.endswith("_Score")]
top = sorted(SCORES, key=lambda f: (-int(S[A][f]), f))[:4]; assert int(S[A][top[2]]) > int(S[A][top[3]]); top = top[:3]
lab = lambda f: f.replace("_", " ")
ctx = f"RFQ-02 demo: regional train rail brake pads, {VOL:,} units per year. Mandatory: {CERT} certified, lead time of {LEAD} days or less, annual capacity of at least {VOL:,} units. Risk gate: Total Risk Index below 50 and Financial Health Score below 50."
items = []
def add(cat, diff, q_, ans, exp, ev, ids, fields):
    items.append({"id": f"BPE-D{len(items)+1:03d}", "category": cat, "difficulty": diff, "scenario_id": "RFQ-02-DEMO",
                  "step": len(items)+1, "context": ctx, "question": q_, "ground_truth_answer": ans, "expected": exp,
                  "evaluation": ev, "supplier_ids": ids, "fields": fields})
add("supplier_discovery", "easy", "We need 30,000 rail brake pads a year for a regional train. Which suppliers offer rail brake pads?",
    f"{len(allids)} suppliers offer rail brake pads: {', '.join(allids)}.", {"ids": allids, "count": len(allids)}, {"method": "set_match"}, allids, ["Product Type"])
add("qualification", "medium", "Which of them meet our mandatory requirements: ISO/TS 22163 certified, lead time of 90 days or less, and capacity of at least 30,000 units a year?",
    f"{len(qids)} suppliers qualify: {', '.join(qids)}.", {"ids": qids, "count": len(qids)}, {"method": "set_match"}, qids, ["Certifications", "Lead Time (days)", "Annual Capacity (units)"])
add("disqualification_reason", "medium", "BRK_0009 is the cheapest rail brake pad offer in the market. Why is it not on the shortlist?",
    f"BRK_0009 (Ardenfield Friction Rail AB) quotes {eur(p(x9))}, holds ISO/TS 22163 and has enough capacity, but its lead time is {x9['Lead Time (days)']} days against a limit of 90. That single requirement excludes it.",
    {"failed_criteria": [f"lead time {x9['Lead Time (days)']} days exceeds 90"]},
    {"method": "rubric", "key_points": [f"Lead time {x9['Lead Time (days)']} days exceeds the 90-day limit", "It meets the certification and capacity requirements", "Lead time is the only failed requirement"]},
    ["BRK_0009"], ["Lead Time (days)", "Certifications", "Annual Capacity (units)"])
add("price_comparison", "medium", "Who is the cheapest qualified supplier, and what would the annual spend be?",
    f"{L} ({S[L]['Supplier Name']}) at {eur(p(low))} per unit. 30,000 x {eur(p(low))} = {eur(p(low)*VOL)} per year.",
    {"answer_id": L, "value": round(p(low)*VOL, 2)}, {"method": "numeric", "tolerance": {"abs": 1.0}, "key_points": [f"Names {L}", f"Annual spend {eur(p(low)*VOL)}"]}, qids, ["Unit Price (EUR)"])
fd = "; ".join(f"{i}: Total Risk Index {tri(i)} ({S[i]['Total_Risk_Index_Level']}), Financial Health Score {fh(i)} ({S[i]['Financial_Health_Score_Level']})" for i in fails)
add("award_recommendation", "hard", "Apply our risk gate, Total Risk Index below 50 and Financial Health Score below 50, and recommend an award.",
    f"{len(fails)} qualified suppliers fail the gate: {fd}. Award to {A} ({S[A]['Supplier Name']}, {S[A]['Country']}, Approved) at {eur(p(award))}: the cheapest qualified supplier that passes (Total Risk Index {tri(A)}, Financial Health Score {fh(A)}). Annual spend {eur(single)}. The cheapest offer, {L}, is excluded by the gate.",
    {"answer_id": A, "fail_ids": sorted(fails), "value": single},
    {"method": "exact_match_id", "key_points": [f"Recommends {A}", f"{L} and {fails[1] if fails[0]==L else fails[0]} fail the gate", f"Points out that the cheapest qualified offer ({L}) fails on financial health"]},
    qids, ["Total_Risk_Index", "Financial_Health_Score", "Unit Price (EUR)"])
prem = round((p(award)-p(low))*VOL, 2)
add("cost_calculation", "medium", "What does the risk gate cost us per year?",
    f"({eur(p(award))} - {eur(p(low))}) x 30,000 = {eur(prem)} per year, the premium for avoiding a supplier with Critical financial health.",
    {"value": prem}, {"method": "numeric", "tolerance": {"abs": 1.0}}, [A, L], ["Unit Price (EUR)"])
add("dual_sourcing", "hard", "For resilience, split it 70/30 between the two cheapest suppliers that pass the gate. Who gets what, and what does it cost?",
    f"70% ({v1:,} units) to {A} at {eur(p(award))} = {eur(p(award)*v1)}; 30% ({v2:,} units) to {B} ({S[B]['Supplier Name']}) at {eur(p(second))} = {eur(p(second)*v2)}. Total {eur(dual)} per year, {eur(dual-single)} more than single-sourcing from {A}. {B} is a prospect with no order history, so it must be onboarded before it can take its share.",
    {"ids_ordered": [A, B], "value": dual},
    {"method": "numeric", "tolerance": {"abs": 1.0}, "key_points": [f"Primary {A}, secondary {B}", f"Total {eur(dual)}", f"Flags {B} as a prospect that needs onboarding"]},
    [A, B], ["Unit Price (EUR)", "Supplier Status"])
mo = VOL // 12
add("award_briefing", "hard", f"Give me a short risk briefing on {A} before we negotiate.",
    f"{A} ({S[A]['Supplier Name']}) is an approved supplier in {S[A]['Country']}. Total Risk Index {tri(A)} ({S[A]['Total_Risk_Index_Level']}). Highest risk areas: "
    + ", ".join(f"{lab(f)} {S[A][f]} ({S[A][f+'_Level']})" for f in top)
    + f". Certifications: {', '.join(certs(A))}. Delivery rating {float(S[A]['Supplier Delivery Rating']):.2f}%. MOQ {int(award['MOQ (units)']):,} units fits a monthly call-off of {mo:,}.",
    {"country": S[A]["Country"], "status": "Approved", "total_risk_index": tri(A), "top_drivers": top},
    {"method": "rubric", "key_points": [f"Country {S[A]['Country']}, Approved", f"Total Risk Index {tri(A)} ({S[A]['Total_Risk_Index_Level']})", "Top risk areas: " + ", ".join(lab(f) for f in top), f"Delivery rating {float(S[A]['Supplier Delivery Rating']):.2f}%"]},
    [A], ["Total_Risk_Index", *top, "Supplier Delivery Rating", "Certifications", "MOQ (units)"])
add("unanswerable", "medium", f"What is the landed cost per unit from {A}, including freight and import duties?",
    "The database holds quoted unit prices only. Freight rates, Incoterms and import duties are not available, so landed cost cannot be calculated. The unit price and annual spend are available instead.",
    {"value": None}, {"method": "refusal"}, [A], ["Unit Price (EUR)"])
with open(f"{root}/demo/rfq02_demo_v1.jsonl", "w", encoding="utf-8") as f:
    for it in items: f.write(json.dumps(it, ensure_ascii=False) + "\n")
for it in items: print(it["id"], "|", it["ground_truth_answer"])
