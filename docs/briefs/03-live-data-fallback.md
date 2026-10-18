# Brief 03: live data service with fallback, and the answer eval

Branch: `feat/live-data-fallback` from `integration`. Do not touch `frontend/src/components/**`,
`frontend/src/app/cases/**`, `frontend/src/app/train/**`.

## Task 1: live service with per-tool fallback
Read `api/README.md` and `api/supplier_api/app.py`. The data service answers `POST {DATA_API_URL}/tools/<tool>` with
the `{ok, data, meta, error}` envelope; five tools are built (get_metadata, list_profiles, get_suppliers,
filter_suppliers, compare_suppliers), the other six return 404 for now. The frontend has two data paths:
`src/lib/data-api/client.ts` (`callDataTool`, static mocks when `DATA_API_MOCK=1`) and a request-time engine under
`src/app/api/data/_engine/` computing seven tools from the CSV. Unify into one resolution order used by
`callDataTool` and the `/api/data/[tool]` route: (1) if `DATA_API_URL` is set and `DATA_API_MOCK` is not `1`, call
the live service with a 3 s timeout; (2) on connection error, timeout or 404, fall back to the engine; (3) if the
engine lacks the tool, fall back to the static mock. Every response carries `meta.source` = `live` | `engine` | `mock`
(the UI shows a badge). Log one line per fallback. Skills and screens both go through this. Document the order in
`frontend/README.md` and `.env.example`. Add `pnpm check:data` that calls each tool once and prints tool, source, ok.

## Task 2: run the chat against the team's eval set
`data/eval/supplier_risk_eval_v1.jsonl` has 173 questions with ground truth (`expected`, `evaluation.method`,
`ground_truth_answer`). `evals/routing/run.ts` accepts `--questions <jsonl>` and `--full`; read its README. Add
`evals/answers/run.ts` (`pnpm eval:answers`) that runs each question through the real chat logic (same prompt, tools,
model), captures final prose and tool outputs, grades with `evaluation.method` (exact_match, numeric with tolerance,
key-point containment otherwise), and writes `evals/answers/results/<model>.json` with per-item pass/fail and a
summary by category and difficulty. Run on `nvidia/nemotron-3-ultra-550b-a55b` with `DATA_API_MOCK=0` and the engine
fallback, concurrency 2, and commit the results. If no `LLM_API_KEY` is present, exit cleanly and say so.

Report: resolution order, `pnpm check:data` output, eval results by category, most common failure pattern.
