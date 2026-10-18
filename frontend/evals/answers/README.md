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
pnpm eval:answers --env .env.nebius --concurrency 4                  # another endpoint: that env file wins over .env
```

Without `LLM_API_KEY` it exits cleanly. Before the first question it makes one request to `{LLM_BASE_URL}/models`
and stops with a message if the endpoint cannot be reached, so an outage does not produce 173 errors. Behind an
HTTPS proxy, Node's `fetch` ignores `HTTPS_PROXY` unless started with `NODE_USE_ENV_PROXY=1`. Rate limits (429) are
retried up to seven times per question with backoff (5 s, 10 s, 20 s, ... capped at 120 s); questions that still fail
are recorded with `error` and can be re-run with `--retry-errors`. A fresh run writes partial results every 10 items
(`"partial": true`), so `--retry-errors` also resumes a stopped run.

Questions run with a neutral workflow (no hard requirements, no shortlist), because the items are standalone.

## Grading (`grade.ts`)

Deterministic: no LLM judge. An item passes when the prose alone, or the prose plus the skill summaries (the rendered
blocks show at least those numbers), passes. Summaries can only add matches for containment checks, but they can cost
set_match precision (a filter summary lists 5 ids for a top-3 question), hence both. `pass_prose_only` is the prose alone.

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

`results/<model>.json` for NVIDIA, `results/<model>.<provider>.json` for other endpoints (`/` in the id becomes `__`). The
model id is lowercased, because endpoints spell the same model differently (Nebius `nvidia/Nemotron-3-Ultra-550b-a55b`);
the summary carries `provider` and `provider_model_id`. Contents: run settings, pass rate overall and `by_category`,
`by_difficulty`, `by_method`, the first skill per question, data call counts per `tool:source`, and one row per item
(`pass`, `score`, `detail`, `key_points`, `prose`, `tool_calls`, `data_calls`, `openui`, `ground_truth_answer`).

## Latest results

`nvidia/nemotron-3-ultra-550b-a55b`, reasoning off (checked: 0 reasoning tokens on both endpoints), 2026-10-18,
`DATA_API_MOCK=0` against the `api/` service (live: get_metadata, list_profiles, get_suppliers, filter_suppliers,
compare_suppliers; engine: explain_supplier). Two runs of the same model:

- `results/nvidia__nemotron-3-ultra-550b-a55b.json`: NVIDIA endpoint, **76/173 (43.9 %)**. Before `run_sql` became
  live only, so every `run_sql` call got the static mock's canned table (see `notes`).
- `results/nvidia__nemotron-3-ultra-550b-a55b.nebius.json`: Nebius endpoint, after the fix (`run_sql` returns
  `NOT_AVAILABLE`), **70/173 (40.5 %)**.

| Category | NVIDIA | Nebius | | Category | NVIDIA | Nebius |
|---|---|---|---|---|---|---|
| comparison | 24/25 | 22/25 | | interpretation | 5/8 | 6/8 |
| screening | 12/12 | 11/12 | | lookup | 6/15 | 5/15 |
| alternatives | 8/8 | 8/8 | | risk_profile | 1/10 | 1/10 |
| unanswerable | 11/15 | 11/15 | | multi_dim_comparison | 1/8 | 0/8 |
| portfolio_ranking | 7/12 | 5/12 | | due_diligence | 0/8 | 1/8 |
| count | 1/12 | 0/12 | | explanation, aggregation, kpi_benchmark | 0 | 0 |

By difficulty (NVIDIA / Nebius): easy 15/29 / 13/29, medium 33/69 / 29/69, hard 28/75 / 28/75.

Failure patterns:

- **No aggregate tool (49 of 97 NVIDIA fails, 40 of 103 Nebius fails)**: counts, sums, averages, KPI-vs-median and
  top-N-by-spend questions go to `run_sql`, which the service has not built. Before the fix the canned mock table was
  narrated as the answer and the model re-queried until the 3-step budget ran out (44 turns without prose); after it,
  the model says the query cannot run (3 of 43 such turns pass). `get_dataset_stats` (engine) could answer the
  KPI-benchmark and average questions but is not a skill.
- **explanation (0/20)**: `explain_supplier` ranks drivers by weighted contribution versus the dataset mean; the
  ground truth names the highest raw scores (16 miss three of the top five), and no answer says the index aggregates
  the 18 categories.
- **Names instead of ids (2 of 14 pass on Nebius)**: for "Prime Solutions 422" the model calls `explain_supplier`
  with `SUPP_00422`; no skill resolves a supplier name.
- **Summaries too thin**: `compare_suppliers` summaries carry no per-field values (multi_dim_comparison), and
  `explain_supplier` omits the sourcing risk level (risk_profile).
