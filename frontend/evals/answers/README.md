# Answer eval

Checks whether the chat gets the answer right, not only the skill. Each question of the team's ground-truth set
(`data/eval/supplier_risk_eval_v1.jsonl`, 173 items; schema in `data/eval/README.md`) runs as a full chat turn through
`chatSetup` (`src/lib/llm/chat.ts`): same system prompt, skills, model and call settings as `POST /api/chat`, max 3
steps, skills executing against the data layer (live service, then engine, then static mock; see "Data sources" in
`frontend/README.md`). The runner records the final prose, every tool call with its summary, and the source of every
data call, then grades the turn.

```bash
pnpm eval:answers                                                    # LLM_MODEL, data source from .env
DATA_API_MOCK=0 DATA_API_URL=http://localhost:8000 pnpm eval:answers # live service first, engine fallback
pnpm eval:answers --model <id> --concurrency 2                       # defaults: LLM_MODEL, 2
pnpm eval:answers --only count --limit 5                             # category, method or difficulty; writes <model>.subset.json
pnpm eval:answers --ids SRE-0001,SRE-0016
pnpm eval:answers --regrade                                          # re-grade results/<model>.json without model calls
pnpm eval:answers --retry-errors                                     # re-run rows that errored (rate limits) or are missing, and merge
pnpm eval:answers --self-test                                        # grade each ground_truth_answer (grader check)
```

Without `LLM_API_KEY` it exits cleanly. Before the first question it makes one request to `{LLM_BASE_URL}/models`
and stops with a message if the endpoint cannot be reached, so an outage does not produce 173 errors. Behind an
HTTPS proxy, Node's `fetch` ignores `HTTPS_PROXY` unless started with `NODE_USE_ENV_PROXY=1`. Rate limits (429) are
retried up to seven times per question with backoff (5 s, 10 s, 20 s, ... capped at 120 s); questions that still fail
are recorded with `error` and can be re-run with `--retry-errors`. A fresh run writes partial results every 10 items
(`"partial": true`), so `--retry-errors` also resumes a stopped run.

Questions run with a neutral workflow (no hard requirements, no shortlist), because the items are standalone.

## Grading (`grade.ts`)

Deterministic: no LLM judge. The graded text is the prose plus the skill summaries (the rendered blocks show at least
those numbers). `pass_prose_only` grades the prose alone.

| `evaluation.method` | Pass when |
|---|---|
| `exact_match` | `expected.value` appears as a number, and `expected.level` as a word when given |
| `exact_match_id` | `expected.answer_id` is named as the winner: in a sentence with a winner word (lowest, best, recommend, ...) before any other candidate, or as the first candidate mentioned |
| `numeric` | a number in the answer (k / M / bn suffixes applied) is within `evaluation.tolerance` (`abs` or `rel`) |
| `set_match` | supplier ids in the answer (ids from the question that are not expected are ignored) reach F1 >= 0.8 against `expected.ids` / `ids_ordered` |
| `refusal` | the answer says the information is not in the data (phrase list in `REFUSAL_RE`) |
| `rubric` | key-point containment: every checkable key point holds. A key point is reduced to supplier ids, numbers (within 0.05 or 0.5 %), level words, field names, above / below, or a refusal / score-direction / aggregation phrase. "States Total Risk Index 81 (Critical)" needs 81 within 80 characters after the field. "At least N of: ..." needs N items. Key points with nothing checkable ("Does not fabricate a value") are recorded as `null` and left out |

Grader check (`--self-test`): every ground-truth answer passes its own item (173/173). As a negative control, grading
each item against the next same-category item's ground truth passes 21/173: refusals (any refusal fits any
unanswerable item) and neighbours that share the answer (same Total Risk Index and drivers, same alternatives).

## Output

`results/<model>.json` (`/` in the id becomes `__`): run settings, pass rate overall and `by_category`,
`by_difficulty`, `by_method`, the first skill per question, data call counts per `tool:source`, and one row per item
(`pass`, `score`, `detail`, `key_points`, `prose`, `tool_calls`, `data_calls`, `openui`, `ground_truth_answer`).

## Brake sets

```bash
pnpm eval:answers --questions ../data/brakes/brake_procurement_eval_v1.jsonl --dataset brakes \
  --workflow evals/answers/brake-case-workflow.json --concurrency 4        # results/brakes__<model>.<provider>.json
pnpm eval:answers --questions ../data/brakes/demo/rfq02_demo_v1.jsonl --dataset brakes \
  --workflow evals/answers/brake-case-workflow.json                        # results/rfq02-demo__<model>.<provider>.json
pnpm check:brakes                                                          # the RFQ math alone, no model: 71/71 scenario items
```

- `--dataset brakes` puts the turns on the brakes dataset (brake skills, brakes section of the prompt) and switches the
  grader to strict mode (see `grade.ts`): `set_match` passes only on the exact set of ids named in the prose and reports
  precision and recall; `refusal` also needs no invented number; `rubric` key points without a checkable value are
  matched by phrase containment and the item is marked `approximate`; Yes / No answers are whole words.
- Items with a `scenario_id` run in `step` order in one conversation (only the question is sent; the history is kept as
  UI messages and converted like `POST /api/chat` does). Other items run alone with their `context` prepended.
- `--workflow` runs under a case context: `brake-case-workflow.json` is the seeded brake case (not started, no filters,
  no pins). Each turn also sends the case screen's `view` (screen, filter chips, earlier blocks), and the skills'
  `set_hard_requirements` / `add_to_shortlist` change the next turn's workflow, as in the app. The answers depend on the
  view: on Nebius the demo went from 1/9 without it to 8/9 with it.
- The provider (`nebius` or `nvidia`, from `LLM_BASE_URL`) goes into the file name and the `provider` field.

## Latest results

`nvidia/nemotron-3-ultra-550b-a55b`, reasoning off, run of 2026-10-18 with `DATA_API_MOCK=0` against the `api/` service
(live: get_metadata, list_profiles, get_suppliers, filter_suppliers, compare_suppliers; engine: explain_supplier).
**76/173 (43.9 %)**, 62 on the prose alone. The run predates `run_sql` becoming live-only, so every `run_sql` call got the
static mock's canned table (see `notes` in the results file).

| Category | Pass | | Category | Pass |
|---|---|---|---|---|
| comparison | 24/25 | | interpretation | 5/8 |
| screening | 12/12 | | lookup | 6/15 |
| alternatives | 8/8 | | risk_profile | 1/10 |
| unanswerable | 11/15 | | multi_dim_comparison | 1/8 |
| portfolio_ranking | 7/12 | | count | 1/12 |
| | | | explanation, aggregation, due_diligence, kpi_benchmark | 0 each |

By difficulty: easy 15/29, medium 33/69, hard 28/75.

Failure patterns (97 fails):

- **run_sql (49)**: counts, aggregates, KPI benchmarks, due-diligence top-N and name lookups go to `run_sql`, which
  returned one canned table for any query; 8 of 57 run_sql turns passed. The model then re-queried until the 3-step budget
  ran out, so 44 of these turns end with no prose (the answer falls back to the default `Table` view).
- **explanation (20)**: `explain_supplier` ranks drivers by weighted contribution versus the dataset mean; the ground truth
  names the highest raw scores (16 miss three of the top five), and no answer says the index aggregates the 18 categories.
- **Names instead of ids (11 of 14 fail)**: for "Prime Solutions 422" the model calls `explain_supplier` with
  `SUPP_00422`; no skill resolves a supplier name.
- **Summaries too thin**: `compare_suppliers` summaries carry no per-field values (multi_dim_comparison 1/8),
  `explain_supplier` omits sourcing risk level (risk_profile), and filter summaries list the top 5 while the
  prose names 3 (top-10 questions).
