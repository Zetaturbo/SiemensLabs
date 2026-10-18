# Supplier Risk Chatbot: Offline Evaluation Dataset

Procurement-style questions with ground truth, generated from the mock supplier risk dataset.

## Files

| Path | Description |
| --- | --- |
| `source/supplier_risk_data.csv` | Mock supplier data, 10,000 suppliers x 46 columns (originally `d75d25545e03.csv`) |
| `source/supplier_risk_criteria.md` | Field definitions (originally `4aeecb7bef24.md`) |
| `supplier_risk_eval_v1.jsonl` | Evaluation set, one item per line (machine-readable, full ground truth) |
| `supplier_risk_eval_v1.csv` | Same items in a flat view for human review |
| `scripts/generate_supplier_risk_eval.py` | Deterministic generator (standard library only) |

## Regenerate

```bash
python3 data/eval/scripts/generate_supplier_risk_eval.py --seed 42
```

Output is byte-identical for the same seed and source file.

## Item schema (JSONL)

```json
{
  "id": "SRE-0001",
  "category": "comparison",
  "difficulty": "easy | medium | hard",
  "question": "Which of SUPP_00012, SUPP_00450 and SUPP_00731 has the lowest financial risk?",
  "ground_truth_answer": "Reference answer in natural language",
  "expected": { "...": "structured values for automated grading" },
  "evaluation": { "method": "...", "key_points": ["..."], "tolerance": {"abs": 0.1} },
  "supplier_ids": ["SUPP_..."],
  "fields": ["Financial_Health_Score"]
}
```

## Coverage (173 items)

| Category | Count | What it tests |
| --- | --- | --- |
| comparison | 25 | Pick the lowest/highest-risk supplier among 2-4 on one dimension |
| explanation | 20 | "Why is the Total Risk Index of X so high/low?" (driver attribution) |
| lookup | 15 | Single score or KPI lookup, by ID or supplier name |
| unanswerable | 15 | Data not in the dataset (country, lead time, trends, unknown IDs) or predictions |
| portfolio_ranking | 12 | Top-N suppliers under a filter (e.g., largest spend with Critical risk) |
| count | 12 | Counting suppliers matching 1-3 conditions |
| aggregation | 12 | Spend exposure, share of spend, average KPIs for a segment |
| screening | 12 | Watchlist: all suppliers matching 3 conditions |
| risk_profile | 10 | Supplier risk briefing before negotiation or QBR |
| multi_dim_comparison | 8 | Side-by-side comparison across several dimensions with a recommendation |
| alternatives | 8 | Recommend replacement suppliers meeting stated criteria |
| interpretation | 8 | Score direction and level bands (trap: "Health"/"Performance" scores are risk scores) |
| due_diligence | 8 | LkSG / CSDDD-style checks on top suppliers by spend |
| kpi_benchmark | 8 | Supplier KPI vs. portfolio median |

## Evaluation methods

| Method | How to grade |
| --- | --- |
| `exact_match` | Answer contains `expected.value` (and `expected.level` where present) |
| `exact_match_id` | Answer names `expected.answer_id` as the winner |
| `set_match` | Supplier IDs in the answer vs. `expected.ids` / `expected.ids_ordered`; report precision and recall |
| `numeric` | Within `evaluation.tolerance` (`abs` or `rel`) of `expected.value` |
| `rubric` | LLM judge or human checks each item in `evaluation.key_points` |
| `refusal` | Answer states the information is unavailable and does not fabricate a value |

## Ground-truth assumptions

1. All scores are risk scores: 0 = no risk, 100 = maximum risk. Bands: Low 0-24, Medium 25-49, High 50-74, Critical 75-100 (verified against every `_Level` column).
2. "Financial risk" maps to `Financial_Health_Score`, "credit risk" to `Credit_Rating_Score`, "cyber security risk" to `Digital_Security_Score`, and so on (see `SCORE_FIELDS` in the generator).
3. The weights behind `Total_Risk_Index` are not documented. It tracks the plain mean of the 18 category scores within about +/-7 points. Explanation questions therefore grade on identifying the highest-scoring categories, not on exact weights.
4. Ties are avoided by construction: comparison winners lead by at least 2 points, and top-N cut-offs are never tied. 21 suppliers sit at the EUR 50M purchase order cap, so top-20-by-spend cuts are not used.
5. Delivery rating and order confirmation rate are performance metrics (higher is better); order change rate is higher-is-worse.

## Verification

88 deterministic items (lookup, comparison, count, screening, aggregation, ranking) were re-verified against the CSV with independent code: 0 mismatches. Rubric items (explanation, risk_profile, multi_dim_comparison, interpretation, kpi_benchmark) should get a human spot check before being used as a release gate.
