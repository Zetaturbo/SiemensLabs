# Skills

One file per skill, registered in `registry.ts`. A skill is a procurement question pattern:
the model picks it (tool use), `run` computes against the data API or the research service (never the LLM),
`summarize` is the only text the model reads, `view` is the deterministic OpenUI default.

| Skill | Data tool(s) | Default view | UI actions | Notes |
|---|---|---|---|---|
| `filter_suppliers` | filter_suppliers | `RankedList` | `set_hard_requirements` when the filters change | merges the workflow's hard requirements in (the question wins per field); the result becomes the case's filters |
| `explain_supplier` | explain_supplier | `ContributionWaterfall` | `open_supplier` | one supplier; "this supplier" = selected supplier |
| `compare_suppliers` | compare_suppliers, list_profiles | `Verdict` (up to 3) / `CompareGrid` | none | deterministic verdict: winner, deciding factor, trade-offs (`verdict.ts`) |
| `rank_with_profile` | rank_with_profile | `RankedList` | `set_profile` when the profile changes | no ids/conditions = workflow hard requirements |
| `run_sql` | run_sql | `Table` | none | catch-all for counts and aggregates; SELECT only |
| `research_company` | research job API (`src/lib/research`) | `RiskFlagList` | `start_research` | real companies only; replay mode without RESEARCH_API_URL |
| `shortlist_memo` | compare_suppliers, explain_supplier + LLM prose | `Memo` | none | the one skill that calls the LLM (scope and recommendation prose only) |
| `update_workflow` | none | none | any of the actions below | shortlist, profile, open views, assign part, case stage, add/remove filters (`set_hard_requirements`) |
| `what_matters` | list_profiles, get_metadata | `Guidance` | none (the block's Apply raises `set_hard_requirements`) | part id or free text -> profile via train-parts.json, keyword fallbacks by criticality; top weighted dimensions, knock-out filters, one-sentence why |
| `find_similar` (optional) | find_similar | `Table` | none | alternatives to one supplier |
| `find_offerings` (brakes) | brake rows (`loadBrakeData`) | `OfferingTable` | none | who offers a product, at what price, lead time, MOQ, capacity; counts and averages |
| `qualify_for_rfq` (brakes) | brake rows (`loadBrakeData`) | `RfqBoard` | none | RFQ steps 2 to 7 on one spec; `focus` picks the step the summary carries |

## Datasets

A turn reads one dataset: `workflow.dataset`, else the part's (`train-parts.json` `dataset`, so the brake case is on
`brakes`), else `portfolio`. `skillsFor(dataset)` in `registry.ts` gives the model its skills: the portfolio list is
unchanged; the brakes list starts with `find_offerings` and `qualify_for_rfq` and swaps in brake variants of
`filter_suppliers` (brake fields, `contains`), `explain_supplier` (the risk briefing: country, status, certifications,
highest raw scores, delivery rating or no history, MOQ vs call-off) and `run_sql` (the service views). The other skills
pass the dataset to every data call (`dataOrThrow(tool, input, dataset)`; portfolio inputs stay exactly as before) and
`normalizeSupplierId` keeps `BRK_0046` ids.

The two RFQ skills get their rows from `loadBrakeData()` (`src/lib/data-api/brakes.ts`): `run_sql` on the data service
views `supplier_offerings`, `supplier_profiles`, `suppliers` when the service is configured and holds brake rows,
else the CSVs in `data/brakes/source`; same shapes either way. The math is in `brake-rfq.ts` (pure); `pnpm check:brakes`
reproduces the 71 scenario items of the brake eval and the demo from it. Keep brake summaries short: Nemotron Ultra
with reasoning off starts inventing ids and prices once a tool result runs past about 2,000 characters.

## Rules

- Name skills after the data tool where one exists so the data owner's eval set maps 1:1.
- Descriptions are routing rules: what it computes, use when, do not use when, what it renders. Keep skills disjoint; `run_sql` is the catch-all.
- Numbers never pass through the model: `run` stores the full result with `ctx.putResult` and returns the handle;
  `summarize` returns the few numbers the model needs to narrate (winner, deciding factor, top drivers).
- Views use positional OpenUI Lang arguments: `root = Verdict("cmp_1a2b3c4d")`. Named arguments (`resultId="..."`) do not parse.
- Add `workedExamples` (question + exact input): they go into the system prompt. `examples` feed suggestion chips (`GET /api/chat`) and eval seeds.
- After adding or changing a skill, run `pnpm eval:routing` and keep it at 27/30 or better.

## Result payloads (what `/api/results/:id` returns)

Handles are `<kind>_<8 hex>`: `filter_`, `explain_`, `cmp_`, `rank_`, `sql_`, `research_`, `memo_`, `ui_`, `similar_`, `find_` (find_offerings), `qualify_` (qualify_for_rfq).

- `filter_*`: the filter_suppliers data (`total_matching`, `suppliers`) plus `conditions`, `sort_by`.
- `explain_*`: the explain_supplier data plus `requested_id`.
- `cmp_*`: the compare_suppliers data (`suppliers`, `per_field`, `family_scores`, `largest_differences`) plus `ids`, `profile_id` and
  `verdict`: `{ focus, focus_label, method, ranking: [{supplier_id, score}], winner, runner_up, margin, deciding_factor: {field, winner_value, runner_up_value, weighted_gap}, caveats: string[] }`.
- `rank_*`: the rank_with_profile data plus `scope` ("ids" or "conditions").
- `sql_*`: `{ query, columns, rows }` (rows are arrays aligned with columns).
- `research_*`: a live `ResearchJobState` (`src/lib/research/types.ts`): `status`, `progress`, `report` (null until done). It updates in place; poll every 2 to 3 s until `status` is `done` or `failed`.
- `memo_*`: `{ title, markdown, source: "llm" | "template", recommended_id, candidate_ids, required_approvals, red_flags, unverified_numbers, facts }`.
- `similar_*`: the find_similar data plus `must_be_lower`.
- `what_*`: `{ query, part, matched_by: "part" | "keyword" | "default", profile_id, profile_label, dimensions: [{field, label, description, family, weight}], filters: FilterCondition[], why }`.
- `find_*`: `{ filters, total, supplier_ids, offerings: [{offering_id, supplier_id, supplier_name, country, supplier_status, product_type, application, material, copper_free, unit_price_eur, moq_units, lead_time_days, annual_capacity_units, total_risk_index(_level), financial_health(_level)}], stats: {offerings, suppliers, min/max/avg_price_eur, median_lead_time_days}, source: "live" | "csv" }`.
- `qualify_*`: `{ spec, offers: [{...offering, qualified, failed: string[], annual_cost_eur, gate: {pass, failures} | null, moq_fits}], qualified_ids, excluded_ids, cheapest_qualified, tie_at_top, gate_failures, award, award_tie, gate_cost_eur, dual: {primary, secondary, total_eur, extra_vs_single_eur} | null, dual_note, moq: {monthly_call_off, over}, focus, focus_id, source }`.
- `explain_*` on the brakes dataset adds `briefing: { country, region, supplier_status, certifications, top_scores, delivery_rating, offerings, moq_check, data_source }`.
