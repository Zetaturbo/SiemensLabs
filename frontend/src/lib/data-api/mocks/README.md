# Data API mocks

One JSON file per tool, named exactly like the tool, each holding a full response envelope
(`{ ok, data, meta, error }`, `ok: true`) with values computed from the real dataset. Served by
`src/lib/data-api/client.ts` as the last step of its resolution order (live service, then the request-time
engine, then these files), so in practice only for tools neither of the first two covers; responses then
carry `meta.source: "mock"`. See "Data sources" in `frontend/README.md`.

## Regenerate

All 11 files come from `scripts/gen-mocks.py`, which reads `data/supplier_risk_dataset.csv` and
`data/risk_criteria_description.md` at the repo root. Run from `frontend/`:

```bash
uv run --with pandas --with numpy python -I scripts/gen-mocks.py          # rewrite all mocks
uv run --with pandas --with numpy python -I scripts/gen-mocks.py --check  # exit 1 if a mock is stale
```

The output is deterministic: no timestamps, fixed key order, ties broken by `supplier_id` ascending.
Derived numbers are rounded to 2 decimals, and whole numbers are written as integers (`41`, not `41.0`).
The script also checks the dataset facts listed below and fails if any of them stops holding.

## Which input each mock answers

Each mock also echoes its input in `meta.mock_input`. The real service will not send that key.

| Mock | Input |
|---|---|
| `get_metadata` | none |
| `list_profiles` | none |
| `get_suppliers` | `ids: [SUPP_00012, SUPP_00450, SUPP_00731, SUPP_00018]`, `fields: null` (all 46 source fields) |
| `filter_suppliers` | `quality_risk_level ne Critical` AND `delivery_rating gte 90`, sort `total_risk_index asc`, `limit 20`, `offset 0`. Result: 5,904 matching |
| `rank_with_profile` | same two conditions, `profile_id: safety_critical`, `limit 20` |
| `compare_suppliers` | `ids: [SUPP_00012, SUPP_00450, SUPP_00731]`, `profile_id: default` |
| `explain_supplier` | `id: SUPP_00018`, `profile_id: default` |
| `find_similar` | `id: SUPP_00450`, `must_be_lower: [geopolitical_risk, environmental_exposure]`, `limit 5` |
| `kraljic_position` | `ids: [SUPP_00012, SUPP_00450, SUPP_00731, SUPP_00018]` |
| `get_dataset_stats` | `fields: [total_risk_index, financial_health, credit_rating, po_volume_eur]`, no conditions |
| `run_sql` | `SELECT total_risk_index_level AS level, COUNT(*) AS n FROM suppliers GROUP BY level ORDER BY n DESC, level` |

## Verified dataset facts

- `total_risk_index = round_half_even(sum(official_weight * sub_score))` holds exactly for all 10,000 rows
  (checked with rational arithmetic). A least-squares fit without intercept recovers the official weights
  to within 0.0003 (RMSE 0.289, which is the rounding noise). The numbers are in `get_metadata.data.official_weights_check`.
- Every `*_level` column matches the bands Low 0-24, Medium 25-49, High 50-74, Critical 75-100.
- `order_change_rate` ranges from 0 to 31.67, `delivery_risk` from 0 to 34.52, `confirmation_risk` from 0 to 38.53.

## Risk families

The contract names the five families but not which fields belong to each. Each of the 18 scores belongs
to exactly one family. `family_scores` in `compare_suppliers` use only these 18 scores, averaged with
their official weights renormalized inside the family. The families carry roughly balanced official weight.

| Family | Scores | Official weight |
|---|---|---|
| `financial` | financial_health, credit_rating | 0.16 |
| `operational_quality` | quality_risk, safety_incident, labor_stability, digital_security | 0.24 |
| `compliance_governance` | compliance_risk, governance_risk, esg_performance, industry_benchmark | 0.22 |
| `external_environment` | geopolitical_risk, political_stability, environmental_exposure, media_sentiment, market_sentiment, external_intelligence | 0.22 |
| `supply_chain_structure` | operational_resilience, sub_tier_visibility | 0.16 |

The reasoning behind the less obvious placements:

- `operational_resilience` is described as "production and logistics capabilities", so it sits with Tier-N
  visibility and the delivery metrics as the supplier network's ability to deliver.
- `labor_stability` covers strikes at supplier sites, which disrupt production, so it sits in operational quality.
- `industry_benchmark` measures standing "against industry peers and regional standards", so it sits in compliance and governance.

Non-score fields also carry a `family` in `get_metadata`, for grouping in the UI only. `delivery_rating`,
`order_confirmation_rate`, `order_change_rate`, `sourcing_risk_level`, `supply_chain_complexity` and the three
derived fields are in `supply_chain_structure`. `total_risk_index` and `po_volume_eur` have no family.
The mapping is defined once, in `FAMILIES` in the script.

## Profiles

Every profile's weights sum to 1.0, so `profile_score` stays on the 0 to 100 scale, where lower is better.
The `safety_critical` weights are the example from ARCHITECTURE.md 5.2. The other three profiles are proposals.
Each profile also returns `family_weights`.

| Field | default | safety_critical | strategic_system | commodity | lksg_due_diligence |
|---|---|---|---|---|---|
| quality_risk | 0.10 | 0.25 | 0.12 | 0.15 | |
| safety_incident | 0.06 | 0.15 | 0.05 | | 0.08 |
| compliance_risk | 0.08 | 0.15 | 0.05 | 0.05 | 0.15 |
| operational_resilience | 0.10 | 0.15 | 0.12 | 0.10 | |
| sub_tier_visibility | 0.06 | 0.10 | 0.08 | | 0.12 |
| financial_health | 0.10 | 0.05 | 0.15 | 0.10 | |
| credit_rating | 0.06 | | 0.10 | 0.05 | |
| governance_risk | 0.05 | 0.05 | 0.07 | | 0.12 |
| esg_performance | 0.05 | | | 0.05 | 0.20 |
| labor_stability | 0.04 | | | 0.05 | 0.15 |
| geopolitical_risk | 0.05 | | 0.08 | | 0.08 |
| political_stability | 0.04 | | 0.05 | | |
| digital_security | 0.04 | | 0.08 | | |
| environmental_exposure | 0.04 | | | | |
| industry_benchmark | 0.04 | | | | |
| market_sentiment | 0.03 | | | | |
| media_sentiment | 0.03 | | | | 0.05 |
| external_intelligence | 0.03 | | | | 0.05 |
| delivery_risk (derived) | | 0.10 | 0.05 | 0.20 | |
| confirmation_risk (derived) | | | | 0.15 | |
| change_risk (derived) | | | | 0.10 | |

Derived fields: `delivery_risk = 100 - delivery_rating`, `confirmation_risk = 100 - order_confirmation_rate`,
`change_risk = 100 * (order_change_rate - 0) / (31.67 - 0)` (min-max over the dataset).

## Computation rules

- `profile_score` is `sum(weight * value)` on the unrounded inputs. For `default`, this is the Total Risk
  Index before rounding: SUPP_00018 has a profile_score of 80.17 and a TRI of 80. Ranking by it never contradicts the TRI order.
- `rank_with_profile`: candidates are ranked by `profile_score` ascending. `default_rank` is the rank within
  the same candidate set under the default profile, and `rank_change = default_rank - rank`, so a positive
  value means the supplier moved up. `top_contributors` lists up to 3 fields by `weight * value`, leaving out zero contributions.
- `explain_supplier`: `contribution_vs_mean = weight * (value - dataset mean of that field)`, sorted descending.
  These contributions sum to the profile score minus the dataset-mean profile score. `percentile` is the share
  of suppliers with a strictly lower value, in percent. `critical_fields` covers all 18 scores whose level is Critical, in contribution order.
- `compare_suppliers`: `best` and `worst` follow each field's direction. Ties go to the earlier id in the input.
  Both are `null` when `spread` is 0, and for `po_volume_eur`, which measures exposure rather than risk.
  `largest_differences` holds the 3 risk scores with the largest spread.
- `find_similar`: Euclidean distance on the 18 raw scores, unweighted. The reference supplier is excluded, and
  every `must_be_lower` field must be strictly lower than the reference's. `differences` gives candidate minus
  reference for the `must_be_lower` fields.
- `kraljic_position`: spend is high when `po_volume_eur >= p75`, where p75 = 1,953,091.34 EUR (linear
  interpolation). Supply risk is high only when `sourcing_risk_level` is High. Quadrants: strategic = high spend + high risk,
  leverage = high spend + low risk, bottleneck = low spend + high risk, non_critical = low spend + low risk.
- `get_dataset_stats`: quantiles use linear interpolation. `std` is the sample standard deviation.
  `level_counts` is `null` for fields that have no level column.
- `filter_suppliers`: with `fields: null`, rows hold all 46 source fields in CSV order. Ties are broken by `supplier_id`.
  Conditions on level and category fields compare by their ordinal order for `lt`, `gt` and `between`.
- `meta.row_count` counts the items in the main list (`suppliers`, `ranking`, `similar`, `stats`, `rows`,
  `fields` or `profiles`); `explain_supplier` counts 1. `meta.truncated` is true when more items matched than were returned.

## Additions beyond the contract

All of these are additive. Clients that ignore unknown keys are unaffected.

- `get_metadata`: every field entry has the same keys (`unit`, `source_column`, `level_field`, `values` and
  `formula` are `null` when they don't apply). The 19 `*_level` fields and the 3 derived fields have entries of their own.
  The response also includes `families`, `default_profile_id`, `dataset_rows` and `official_weights_check`.
- `list_profiles`: `family_weights` per profile.
- `rank_with_profile`: `weights` (as resolved), `total_matching`, and `supplier_name` per row.
- `compare_suppliers`: each supplier also has its `*_level` fields, `sourcing_risk_level`,
  `supply_chain_complexity` and `profile_score`. Each `per_field` entry has a `direction`.
- `explain_supplier`: `supplier_name`, `profile_id`, `profile_score`, `dataset_mean` per contribution, and
  `context` (po_volume_eur, sourcing_risk_level, supply_chain_complexity).
- `find_similar`: `reference_values`, `total_matching`, and `supplier_name` per row.
- `kraljic_position`: `quadrant_counts` for the whole dataset (useful as the matrix background),
  `po_volume_eur_percentile`, `supply_risk_high_levels`, and `supplier_name`, `spend_high`, `supply_risk_high` per supplier.
- `get_dataset_stats`: `count` and `std`.

## Open decisions for the data owner

1. **Kraljic and Medium sourcing risk.** ARCHITECTURE.md 5.9 recommends treating Medium as high supply risk.
   The team lead decided Medium counts as low, which is what these mocks use. Across the dataset that gives
   strategic 852, leverage 1,648, bottleneck 2,650 and non-critical 4,850. Treating Medium as high would give
   1,595 / 905 / 4,931 / 2,569.
2. **Derived risks are not rescaled.** As the contract specifies, `delivery_risk` and `confirmation_risk` are
   `100 - rate`, which only reaches 34.52 and 38.53 (means 8.64 and 14.05). A weight on them therefore moves
   the score less than the same weight on a 0-100 score. In `commodity`, 35% of the weight sits on
   these two fields. Min-max rescaling, as already done for `change_risk`, would fix this, but it would change the contract.
3. **`total_risk_level` vs `total_risk_index_level`.** `explain_supplier` uses the contract key `total_risk_level`,
   while rows use `total_risk_index_level`. Both are kept as specified. Consider unifying them.
4. **Percentile precision.** Percentiles are given to 2 decimals (98.31). With 10,000 rows this is exact. The contract example rounds to 1 decimal (98.3).
5. **`run_sql` row shape.** Rows are arrays aligned with `columns`, as `[["High", 4813], ...]`, not objects.
   `ORDER BY` was added to the query so the result is deterministic.
6. **Contract example values.** Some numbers in ARCHITECTURE.md are illustrative and differ from the data. For example,
   the Kraljic example shows 129,814.45 EUR for SUPP_00012, which is SUPP_00001's volume. SUPP_00012's real
   volume is 489,626.69 EUR, which still places it in bottleneck. All values in these mocks come from the CSV.
   The SUPP_00018 values in 5.7 match exactly.
