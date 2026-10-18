# Research service: integration notes

For the integration review. Owner: Jose. Branch: `feature/research-service`, based on `main`. It changes only
`research/`, `docs/`, `mocks/` and `CLAUDE.md`, so it merges into `main` without touching `api/`, `db/`, `data/` or `frontend/`.
`docs/ARCHITECTURE.md` (the contract everyone cites, listed as missing in `docs/HANDOFF.md`) is included.

## What the frontend already expects, and what we provide

| Frontend (`frontend/src/lib/research`, `skills/research-company.ts`) | Research service |
|---|---|
| `POST {RESEARCH_API_URL}/tools/<tool>`, envelope `{ok, data, meta, error}` | Same convention as `api/`. FastAPI, port 8001 suggested (data service uses 8000) |
| Tools `research_company`, `get_research_status`, `confirm_entity`, `get_research_report` | Same names and shapes. Fields are only added, never renamed |
| Sends `focus`, `depth` and optional `supplier_id` | `focus` and `depth` are accepted and ignored. `supplier_id` is echoed back, a label only |
| Polls status every 2.5 s for up to 15 minutes | Jobs run in the background and are stored in Postgres, so a restart does not lose them |
| Replay mode when `RESEARCH_API_URL` is empty | Unchanged. Set `RESEARCH_API_URL=http://localhost:8001` to go live |

Additions to the report (all optional, the current frontend types ignore them): per flag `dimension`, `claim_ids`,
`verification`; top level `claims[]`, `verification_summary`, `simulated`, `job_id`. Progress steps gain `agent` and `ts`.
See `mocks/research_report.json` and `mocks/research_progress.json`.

## Rules the service enforces

- Only verified claims reach the report. Every claim carries a verbatim quote that is string-matched against the stored page text.
- Agents can only reach the closed source lists in `research/config/sources.json`, enforced twice (Tavily domain filter and our own URL check).
- `SUPP_` and `BRK_` ids are refused with `SYNTHETIC_ENTITY`: their names are invented, so there is nothing to research.
  The buyer-made link from a dataset supplier to a real company travels as `supplier_id` and never affects a search or a score.
- Research never changes dataset scores. The brakes data (`BRK_`, with country and certifications) is not read by the service.

## Status (2026-10-18)

| Part | State |
|---|---|
| Service scaffold, envelope, `/health`, config | Done, 42 tests |
| Report, claim and status models; mocks validate against them | Done |
| Source adapters (Tavily live, sandbox), closed lists, page cleaning | Done |
| LLM client with retry and fallback across providers | Done |
| Sources locked from a probe of 86 domains with real suppliers | Done, `docs/SOURCES_AND_MODELS.md` |
| Models compared on real lane tasks | Done, `docs/SOURCES_AND_MODELS.md` |
| Job API tools, planner, lane agents, verifier, report writer | Not built yet (tickets R4 to R10) |
| Real Knorr-Bremse report to replace the canned replay | Not built yet (R19) |
| Dockerfile and deployment | Not built yet (R20) |

## What we need from the frontend and data owners

1. Confirm the additive report fields and progress steps above. Nothing blocks the build.
2. Where the service runs for the demo (Google Cloud or a VPS, containers) and who sets the keys: `TAVILY_API_KEY`,
   `LLM_API_KEY` (NVIDIA free tier) and `NEBIUS_API_KEY`. Keys live in `research/.env`, which is gitignored.
3. The service stores jobs in the shared Postgres in tables prefixed `research_`, with its own migration in
   `research/migrations/`. Tell us if the data owner wants those migrations in `db/` instead.
4. Whether the finalists flow should start research from a `BRK_` supplier by passing the buyer-linked real company name.
   The `country` of a brake supplier is a good entity-resolution hint to pass along.

## Known risks

- Live web results vary. A sandbox mode with fictional companies, clearly labeled simulated, is the demo fallback (R3).
- The free NVIDIA tier is rate limited and 3 to 5 times slower than the paid Nebius account for the same model.
  Every agent role ends its model chain on the free tier, so a run still works if the paid credits run out.
- Some sources cannot be extracted (see the dropped list in `docs/SOURCES_AND_MODELS.md`). Coverage of EU competition cases
  and German insolvency notices is a known gap.
- A claim check by a model is a judgement. The verifier is measured on hand-labelled cases (see the models doc), and a
  high-severity claim always needs a second independent source.
