# Shortlist board

Heatmap grid of up to 20 suppliers by dimension with family tabs (compare_suppliers), family radar, weight sliders
bound to rank_with_profile custom_weights (live re-rank with default rank and rank change), advance to finalists,
drop with a documented reason (DropDialog, also used by the finalists view).

Supplier drawer, finalists view and memo live in `src/components/case/`.

Data access for all case screens: `useDataTool(tool, input)` from `src/lib/hooks/use-data-tool.ts`, which POSTs to
`/api/data/:tool` (`src/app/api/data/[tool]/route.ts`). With `DATA_API_MOCK=1` the route answers from an
input-aware mock engine over `data/supplier_risk_dataset.csv` (same formulas as `scripts/gen-mocks.py`).
