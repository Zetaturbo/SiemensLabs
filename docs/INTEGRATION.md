# Research service: integration notes

For the integration review. Owner: Jose. Branch: `research/job-tools`, based on `integration`. It changes only
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
| Service scaffold, envelope, `/health`, config | Done |
| The four tools the frontend calls (`research_company`, `get_research_status`, `confirm_entity`, `get_research_report`) plus `get_research_claims` and `list_research_jobs` | Done and tested over HTTP |
| Workflow: entity resolution (GLEIF), planner, four lane agents in parallel with fixed baseline searches, verifier with second-source rule, report writer | Done. Live runs on the real web took 41 to 56 seconds, simulated companies 13 to 30 seconds |
| Sources locked from a probe of 86 domains, models compared on real tasks | Done, `docs/SOURCES_AND_MODELS.md` |
| Two simulated demo companies for the brake case | Done (`research/sandbox/`) |
| Job store | File-backed, survives restarts. Postgres version not built (needs Docker on a dev machine to test) |
| Red-flag follow-up searches, MLflow tracing | Not built (R10, R11) |
| Fresh real reports to replace the canned replay | Done, see below |
| Dockerfile and deployment | Not built (R20) |

## Fresh data for the demo (generated 2026-10-18 on the live web)

Real runs of the final setup. Each report is machine-verified (every quote is string-matched against the stored page, then judged by a
second model) and has not been reviewed by a person. They replace the canned Knorr-Bremse replay, which stated 2018 antitrust facts from
model memory. The Knorr-Bremse one now carries the 2018 US Department of Justice complaint with its primary source.

| Company | File | Overall | Claims | Flags | Top finding |
|---|---|---|---|---|---|
| Knorr-Bremse AG | `mocks/research_report_knorr_bremse.json` | elevated | 12 verified, 4 unconfirmed | 6 | 2018 U.S. Antitrust Complaint on No-Poach Agreements (2018-04-03) |
| Vossloh AG | `mocks/research_report_vossloh.json` | elevated | 9 verified, 7 unconfirmed | 7 | Historical Cartel Fine in Germany (2016-03-10) |
| Westinghouse Air Brake Technologies (Wabtec) | `mocks/research_report_wabtec.json` | elevated | 7 verified, 10 unconfirmed | 4 | 2008 FCPA Violations in India (2008-02-14) |

They follow the report shape in `frontend/src/lib/research/types.ts` (plus the optional extra fields), so the frontend replay can load them as
they are. To refresh one: `.venv/bin/python scripts/run_research.py "<company>" --country DE --website <site> --save ../mocks/research_report_<name>.json`.

## Test it from the frontend

1. `cd research && cp .env.example .env`, fill `TAVILY_API_KEY`, `LLM_API_KEY`, `NEBIUS_API_KEY`.
2. `research/scripts/serve.sh` (port 8001; uses uv, else `.venv`, else python3). Docker: `docker compose up --build` in `research/` (not built yet on a dev machine).
3. `RESEARCH_API_URL=http://localhost:8001` in `frontend/.env`.
4. Ask the chat "research Knorr-Bremse" (real web, under a minute) or "research Fennic Railway Brakes GmbH" (simulated, about 30 seconds,
   no Tavily credits, labeled simulated). `GET /health` shows which keys are configured.

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
