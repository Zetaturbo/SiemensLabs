# Routing eval

Checks that the model picks the right skill. Each question goes through the model with the same system prompt and
tools as `POST /api/chat` (`chatSetup` in `src/lib/llm/chat.ts`), temperature 0. The first tool call is compared to
`expected_skill`. Target: at least 27 of 30 on the demo model.

```bash
pnpm eval:routing                                            # LLM_MODEL, questions.json
pnpm eval:routing --model nvidia/nemotron-3-ultra-550b-a55b,nvidia/nemotron-3-super-120b-a12b
pnpm eval:routing --questions ../data/eval/supplier_risk_eval_v1.jsonl --full --model <id>
pnpm eval:routing --only compare_suppliers --limit 5
```

| Flag | Meaning |
|---|---|
| `--model a,b` | models to run, one after the other (default `LLM_MODEL`) |
| `--questions <file>` | `.json` array or `.jsonl`, path relative to `frontend/` (default `questions.json`) |
| `--full` | run complete turns: skills execute against the mocks, max 3 steps, records `tool_calls` with summaries, `final_text` and the rendered `answer` part for answer-quality grading |
| `--only <skill>` / `--limit n` | subsets |

Without `LLM_API_KEY` in `frontend/.env` the script exits cleanly with a message. The key is never printed.

## Question format

```json
{ "question": "...", "expected_skill": "compare_suppliers", "expected_args": { "ids": ["SUPP_00012"] }, "workflow": { "shortlist": [] } }
```

- `expected_skill`: skill name, `null` = expect no tool call (out-of-scope questions such as price), absent = not graded for routing
  (useful for answer-quality sets). `expected_tool` is accepted as an alias.
- `expected_args`: optional subset of the tool input; strings match case- and separator-insensitively, arrays as sets.
- `workflow`: optional override of the eval workflow (compare step, default profile, shortlist SUPP_00012 / SUPP_00450 /
  SUPP_00731, selected SUPP_00018, hard requirement `quality_risk_level ne Critical`).
- Any other fields (`id`, `ground_truth_answer`, `expected`, ...) are passed through to the results as `question_meta`.

## Output

- `results/<model>.json` per model (`/` in the id becomes `__`): summary (accuracy, args matched, invalid inputs, errors,
  TTFT median / p90 / mean) plus one row per question.
- `last-run.json`: all models of the last invocation.

Time to first token is measured from the request to the first streamed model output of any kind (text, tool input).

## Latest results (reasoning off, NVIDIA build endpoint, 30 questions)

See `results/`. Run of 2026-10-18:

| Model | Correct | Args matched | TTFT median | TTFT p90 |
|---|---|---|---|---|
| nvidia/nemotron-3-ultra-550b-a55b (default) | 30/30 | 16/16 | 0.86 s | 1.50 s |
| nvidia/nemotron-3-super-120b-a12b (fallback) | 30/30 | 15/16 | 1.57 s | 2.35 s |

An earlier run with slightly different skill descriptions gave Super 29/30 (it sent a "which suppliers ..." filter
question to run_sql). z-ai/glm-5.3 was not run: its first byte took over 80 s on the free tier.
