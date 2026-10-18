# Brief 04: brake sourcing on the simulated brake dataset

Branch: `feat/brake-sourcing` from `integration`, after briefs 01 and 03 are merged (needs the chat-first case screen,
the `what_matters` skill pattern, the unified data resolution with `meta.source`, and `evals/answers/run.ts`).
Owner of this brief edits `frontend/src/lib/data-api/**` (engine, types, client), `frontend/src/skills/**`,
`frontend/src/components/ui-blocks/**`, `frontend/src/lib/openui/library.tsx`, `frontend/src/lib/cases/seed.ts`,
`frontend/src/lib/prompt/system-prompt.ts`, `frontend/src/config/train-parts.json` (a `dataset` field only),
`frontend/evals/**`. Do not touch `frontend/src/components/train/**`, `frontend/src/components/case/**`,
`frontend/src/app/**`, `api/`, `db/`, `data/`.

## Why
The demo case is the brake system. A teammate added `data/brakes/` (read `data/brakes/README.md` first): 60 invented
brake suppliers `BRK_0001..BRK_0060` with the 46 portfolio columns plus Country, Region, Supplier Status
(Approved / Prospect) and Certifications; 124 offerings (product type, application, material, copper-free, unit price,
MOQ, lead time, annual capacity); and `brake_procurement_eval_v1.jsonl`, 130 RFQ-style questions with ground truth.
The brake case must work on this pool and answer the RFQ questions. The team's demo is `data/brakes/demo/rfq02_demo_script.md`
(nine questions with expected answers, machine-readable in `rfq02_demo_v1.jsonl`), and the agent procedure they wrote
is `.claude/skills/brake-rfq-procurement/SKILL.md`: read both first. The live data service exposes the brake data to
`run_sql` through the views `supplier_offerings`, `supplier_profiles` and `suppliers` (migrations 004 and 005, after
`db/ingest_brakes.py`), but has no dedicated offerings tool and the Postgres load mixes brake suppliers into
portfolio answers. So: deterministic skills in the frontend engine own the RFQ math; when the live service is up they
read the brake rows through its `run_sql` views, otherwise from the CSVs. The portfolio stays on the live service.

## Build
1. Datasets in the engine. Two named datasets: `portfolio` (today's CSV) and `brakes` (`data/brakes/source/*.csv`,
   offerings joined on `supplierID`). Every data call carries `dataset` (default `portfolio`); add it to
   `WorkflowContext` and to the `/api/data/[tool]` body; `callDataTool` passes it through. The case derives it from
   its part: `train-parts.json` gets `"dataset": "brakes"` on `brake_system`. All existing tools (`get_metadata`,
   `filter_suppliers`, `compare_suppliers`, `rank_with_profile`, `explain_supplier`, `find_similar`, stats, Kraljic,
   `run_sql`) work on either dataset; for `brakes`, `get_metadata` also describes `country`, `region`,
   `supplier_status`, `certifications` and the offering fields. Resolution stays brief 03's: live first (404 for
   anything it lacks), engine, static mock; the static mocks remain portfolio-only. Portfolio answers must not change.
2. Two new skills, deterministic, following the skill pattern (tool, `run`, `summarize`, `view`). Their `run` gets the
   brake rows from one loader: live `run_sql` against the three views when `meta.source` would be live, else the CSVs
   (same shapes either way, numbers never through the model):
   - `find_offerings`: filters on product type, application, material, copper-free, max lead time, min annual
     capacity, max MOQ, required certifications, region, supplier status; returns offerings with their supplier's id,
     name, country, status, Total Risk Index, Financial Health Score; sorted by unit price. Block `OfferingTable`.
   - `qualify_for_rfq`: input is an RFQ spec (product type, annual volume, mandatory certifications, copper-free,
     max lead time days, region, approved-only, risk gate on/off with defaults Total Risk Index < 50 and Financial
     Health Score < 50). Output per supplier offering: qualified or the named failed criteria (use the eval's wording:
     the certification name, "copper-free", "lead time", "capacity", "region", "status"); the price ranking of the
     qualified; annual cost = volume x unit price; risk gate pass or fail with the failing score; the award (cheapest
     qualified passing the gate); the extra cost of the gate (award minus cheapest qualified); dual sourcing 70/30
     across the two cheapest gate-passing suppliers; MOQ check against the monthly call-off (volume / 12). Block
     `RfqBoard`: requirement chips, qualified table with failed criteria, award card, dual-source split, MOQ flags.
   Register both, add worked examples and two routing questions each to `evals/routing/questions.json`, rerun
   `pnpm gen:openui`, commit the snapshot. The briefing question ("short risk briefing on BRK_0020") goes through
   `explain_supplier`: on the brakes dataset it must state country, Total Risk Index with level, the top risk drivers,
   and "no delivery history" for prospects.
3. Procedure and refusals. For a case on the brakes dataset the system prompt adds the step procedure from
   `.claude/skills/brake-rfq-procurement/SKILL.md` condensed to ten lines (one step per turn, numbers only from tool
   results, offer the next step in one short line) and routes each step to the two skills above or `explain_supplier`.
   The prompt gets one rule block for brakes: unit prices exclude freight, duties and tooling, so landed
   cost, total cost of ownership, friction coefficients, PPAP status, tooling cost, price forecasts, products not in
   the catalog, delivery ratings of prospects and unknown ids are answered as unavailable, with no number invented.
4. Case. `case_brake_system` seeds on the brakes dataset: pinned candidates are `BRK_` ids, the opening message and
   chips fit an RFQ ("Which suppliers offer disc brake pads?", "Qualify for RFQ-01", "What matters for brakes?"),
   filter chips work with the brake fields (status, certifications contains, region).
5. Eval. `pnpm eval:answers --questions ../data/brakes/brake_procurement_eval_v1.jsonl --dataset brakes`. Items with a
   `scenario_id` run in `step` order inside one conversation (shared message history, only `question` sent); items
   without run standalone with `context` prepended. Grading per `evaluation.method`: `exact_match`, `exact_match_id`,
   `numeric` with `tolerance.abs` or `rel`, `set_match` (ids in the answer vs `expected.ids` or `ids_ordered`;
   pass only on the exact set, report precision and recall), `refusal` (states unavailable and contains no invented
   number), `rubric` (every key point contained after normalisation; mark the result approximate). Run on
   `nvidia/nemotron-3-ultra-550b-a55b`, concurrency 2, commit `evals/answers/results/brakes__<model>.json`. The
   portfolio run from brief 03 must still produce the same summary.

## Verify
Run the nine questions of `data/brakes/demo/rfq02_demo_script.md` in order in one conversation on
`/cases/case_brake_system` against the real model (one turn at a time) and check the ids and amounts against the
script: 9 suppliers, 4 qualified, BRK_0009 out on lead time 102 > 90, BRK_0030 cheapest at 128.24 and 3,847,200 a year,
award BRK_0046 at 138.27 after the gate, gate cost 300,900, 70/30 split 21,000 / 9,000 with BRK_0058 flagged as a
prospect, the briefing on BRK_0046, the landed-cost refusal. The opening chips of the brake case are the first three
demo questions. Light and dark theme. The four checks pass. Also run `pnpm eval:answers --questions
../data/brakes/demo/rfq02_demo_v1.jsonl --dataset brakes` and commit its result next to the full brake run.

Report: dataset switch design, the two tools' inputs, eval results by category and difficulty for brakes, most common
failure pattern, what the live service would need to take over the brake data.
