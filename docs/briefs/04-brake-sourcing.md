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
The brake case must work on this pool and answer the RFQ questions. The live data service has no offerings tool yet
and its Postgres load of the brake suppliers pollutes portfolio answers, so the frontend engine owns the brake dataset
for the demo; the live service stays the source for the portfolio.

## Build
1. Datasets in the engine. Two named datasets: `portfolio` (today's CSV) and `brakes` (`data/brakes/source/*.csv`,
   offerings joined on `supplierID`). Every data call carries `dataset` (default `portfolio`); add it to
   `WorkflowContext` and to the `/api/data/[tool]` body; `callDataTool` passes it through. The case derives it from
   its part: `train-parts.json` gets `"dataset": "brakes"` on `brake_system`. All existing tools (`get_metadata`,
   `filter_suppliers`, `compare_suppliers`, `rank_with_profile`, `explain_supplier`, `find_similar`, stats, Kraljic,
   `run_sql`) work on either dataset; for `brakes`, `get_metadata` also describes `country`, `region`,
   `supplier_status`, `certifications` and the offering fields. Resolution stays brief 03's: live first (404 for
   anything it lacks), engine, static mock; the static mocks remain portfolio-only. Portfolio answers must not change.
2. Two new skills, engine-computed, deterministic, following the skill pattern (tool, `run`, `summarize`, `view`):
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
3. Refusals. The prompt gets one rule block for brakes: unit prices exclude freight, duties and tooling, so landed
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
On `/cases/case_brake_system`: "Which suppliers in our database offer disc brake pads?" lists 19 ids (BPE-0001);
"which meet IATF 16949, ECE R90, copper-free, lead time 50 days or less, capacity 1,500,000?" gives the four of
BPE-0002; "Why is BRK_0002 not qualified?" names the failed criteria of BPE-0003; "Recommend a supplier for RFQ-01
with the risk gate" names the award of the RFQ-01 award item; "What is the landed cost per unit?" refuses. Ground
truth for each is in the eval file. Light and dark theme. The four checks pass.

Report: dataset switch design, the two tools' inputs, eval results by category and difficulty for brakes, most common
failure pattern, what the live service would need to take over the brake data.
