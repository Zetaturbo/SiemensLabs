# Brake Procurement: Simulated Suppliers and Evaluation Dataset

Simulated brake manufacturers with risk scores and product offerings, and procurement-style questions with ground
truth for testing a brake sourcing process end to end. All suppliers, names and values are invented.

## Files

| Path | Description |
| --- | --- |
| `source/brake_suppliers.csv` | 60 suppliers (`BRK_0001` to `BRK_0060`): the 46 columns of the main dataset plus Country, Region, Supplier Status, Certifications |
| `source/brake_offerings.csv` | 124 product offerings: product type, application, material, copper-free, unit price, MOQ, lead time, annual capacity |
| `source/brake_supplier_criteria.md` | Definitions of the brake-specific attributes |
| `brake_procurement_eval_v1.jsonl` | Evaluation set, one item per line (full ground truth) |
| `brake_procurement_eval_v1.csv` | Same items in a flat view for human review |
| `scripts/generate_brake_suppliers.py` | Deterministic supplier and offering generator (standard library only) |
| `scripts/generate_brake_procurement_eval.py` | Deterministic question generator (standard library only) |

## Regenerate

```bash
python3 data/brakes/scripts/generate_brake_suppliers.py --seed 7
python3 data/brakes/scripts/generate_brake_procurement_eval.py --seed 42
```

Output is byte-identical for the same seeds.

## Load into Postgres (optional)

Requires migration `003_supplier_offerings.sql` and a prior `db/ingest.py` run.

```bash
uv run --with "psycopg[binary]" db/ingest_brakes.py           # load
uv run --with "psycopg[binary]" db/ingest_brakes.py --remove  # remove again
```

Loading adds the 60 brake suppliers to `suppliers`, `supplier_scores` and `supplier_wide`, so portfolio-wide answers
in `data/eval/supplier_risk_eval_v1` and the API mock tests no longer match while they are loaded. Product data goes
to `supplier_profiles` and `supplier_offerings`.

## Item schema (JSONL)

Same as `data/eval/supplier_risk_eval_v1`, plus three fields:

```json
{
  "id": "BPE-0021",
  "category": "award_recommendation",
  "difficulty": "hard",
  "scenario_id": "RFQ-02",
  "step": 8,
  "context": "RFQ-02: regional train rail brake pad RFQ for 30,000 rail brake pads per year. Mandatory requirements: ...",
  "question": "Recommend a supplier for the regional train rail brake pad RFQ: ...",
  "ground_truth_answer": "Award to BRK_0046 ...",
  "expected": {"answer_id": "BRK_0046", "value": 138.27},
  "evaluation": {"method": "exact_match_id", "key_points": ["..."]},
  "supplier_ids": ["..."],
  "fields": ["..."]
}
```

Scenario items (`scenario_id` set) are meant to be asked in `step` order in one conversation. `context` restates the
RFQ requirements so any step can also be graded on its own.

## RFQ scenarios (76 items)

| Scenario | Product | Volume / year | Mandatory requirements | What it tests |
| --- | --- | --- | --- | --- |
| RFQ-01 | Disc brake pads | 1,500,000 | IATF 16949, ECE R90, copper-free, lead time <= 50 days | Cheapest qualified supplier is a prospect; approved-only variant |
| RFQ-02 | Rail brake pads | 30,000 | ISO/TS 22163, lead time <= 90 days | Cheapest qualified supplier fails the risk gate (Critical financial health) |
| RFQ-03 | Yaw brake pads | 15,000 | ISO 14001, EU-based, lead time <= 90 days | Region filter; MOQ above monthly call-off |
| RFQ-04 | Spring-applied brakes | 10,000 | ISO 9001, ISO 14001, lead time <= 75 days | Two of three qualified suppliers fail the risk gate; no dual-sourcing option |
| RFQ-05 | Air disc brake pads | 400,000 | IATF 16949, lead time <= 50 days | Capacity-driven exclusions; clean award and dual sourcing |
| RFQ-06 | Brake discs | 1,000,000 | IATF 16949, ECE R90, lead time <= 45 days | Prospect vs approved supplier, large price gap |

Every scenario also requires annual capacity >= volume. Risk gate: Total Risk Index below 50 and Financial Health
Score below 50. Steps per scenario: supplier discovery, qualification, disqualification reasons, lowest price, annual
cost, risk gate, award recommendation, cost of the risk gate, approved-only award, MOQ check, supplier briefing, dual
sourcing (70/30), and an unanswerable landed-cost question. Steps are skipped where they do not apply.

## Coverage (130 items)

| Category | Count | What it tests |
| --- | --- | --- |
| unanswerable | 16 | Landed cost, friction coefficients, PPAP, tooling, price forecasts, products not in catalog, prospects' delivery rating, unknown IDs |
| disqualification_reason | 12 | Which mandatory requirements a supplier fails |
| offering_lookup | 10 | Unit price, lead time, MOQ, capacity of one offering |
| award_recommendation | 9 | Lowest price after qualification and risk gate, with and without prospects |
| cost_calculation | 8 | Annual spend; extra cost of the risk-cleared award |
| count | 8 | Suppliers or offerings matching a condition |
| supplier_discovery, qualification, price_comparison, risk_gate, moq_check, award_briefing | 6 each | Scenario steps |
| supplier_lookup | 6 | Country, overall risk, certifications |
| aggregation | 6 | Average price, median lead time, spend by region |
| dual_sourcing | 5 | 70/30 split across the two cheapest risk-cleared suppliers |
| cert_check | 5 | Yes/no certification checks |
| geo_risk_screen | 4 | Suppliers per application with Geopolitical Risk Score >= 50 |
| interpretation | 3 | Scores are risk scores (higher = worse) |
| performance_lookup | 2 | Delivery rating of approved suppliers |

Evaluation methods are the same as in `data/eval/README.md`.

## Ground-truth assumptions

1. Scores follow the main dataset: 0 = no risk, 100 = maximum risk; bands Low 0-24, Medium 25-49, High 50-74, Critical 75-100. Total Risk Index is the mean of the 18 category scores plus up to +/-3 noise.
2. Unit prices exclude freight, duties and tooling, so landed-cost and total-cost-of-ownership questions are unanswerable by design.
3. Ties are avoided: price winners lead by at least EUR 0.05, and briefing "top risk areas" are cut short rather than split a tie.
4. Location-driven scores (geopolitical, political stability, environmental exposure) mainly follow the country; financial health and credit rating are correlated.

## Verification

78 deterministic items (scenario steps, counts, averages, lookups) were re-verified with independent SQL over the CSVs:
0 mismatches. The RFQ-02 qualification was also reproduced with SQL against Postgres after `db/ingest_brakes.py`.
Rubric items (disqualification_reason, award_briefing, interpretation) should get a human spot check before being used
as a release gate.
