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

## Rules

- Name skills after the data tool where one exists so the data owner's eval set maps 1:1.
- Descriptions are routing rules: what it computes, use when, do not use when, what it renders. Keep skills disjoint; `run_sql` is the catch-all.
- Numbers never pass through the model: `run` stores the full result with `ctx.putResult` and returns the handle;
  `summarize` returns the few numbers the model needs to narrate (winner, deciding factor, top drivers).
- Views use positional OpenUI Lang arguments: `root = Verdict("cmp_1a2b3c4d")`. Named arguments (`resultId="..."`) do not parse.
- Add `workedExamples` (question + exact input): they go into the system prompt. `examples` feed suggestion chips (`GET /api/chat`) and eval seeds.
- After adding or changing a skill, run `pnpm eval:routing` and keep it at 27/30 or better.

## Result payloads (what `/api/results/:id` returns)

Handles are `<kind>_<8 hex>`: `filter_`, `explain_`, `cmp_`, `rank_`, `sql_`, `research_`, `memo_`, `ui_`, `similar_`.

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
