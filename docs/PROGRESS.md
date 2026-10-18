# Progress

Update this after every ticket. Claude Code reads it at the start of each session.

## Status
- Branch `feature/research-service`, based on `main`. It changes only `research/`, `docs/`, `mocks/` and `CLAUDE.md`.
- Aligned with the team's direction (checked 2026-10-18): the frontend owns the finalists flow and calls us through
  `RESEARCH_API_URL`; the data service and the Postgres database are on `main`; the brakes dataset (`BRK_` ids, invented
  names) is the demo data. See `docs/INTEGRATION.md`.
- Sources and models are chosen and measured on real pages: `docs/SOURCES_AND_MODELS.md`.
- Watchdog and score overlay are paused (SPEC section 9, tickets R12 and R13).

## Done
- R0: `research/` scaffold (FastAPI, `POST /tools/<tool>` envelope, `/health`, config from env).
- R1: report, claim and status models; both mocks validate. A flag can only cite verified claims.
- R2: source adapters (Tavily with the closed lane lists enforced twice, sandbox), page cleaning, advanced-extraction retry,
  domain subsetting; LLM client with retry and fallback across providers.
- `SUPP_` and `BRK_` id guard (`SYNTHETIC_ENTITY`).
- Sources: 86 candidates probed with real suppliers, 57 domains locked with trust tiers, 4 structured sources checked.
- Models: 14 compared on real tasks, chains locked per role (provisional until the live agent loop is timed).
- 42 tests, no keys needed.

## Next
- R3: sandbox corpora for 2 fictional companies.
- R4: news lane end to end, then R5 verifier, R6 report writer, R7 job API.
- Time the live agent loop (`eval_models.py --tasks agent`) and rerun Nemotron Super and Ultra extract, verify, writer.
- R19: real Knorr-Bremse report to replace the canned replay. R20: Dockerfile. R21: sanctions list screening.

## Open decisions
- Which 2 fictional companies for the sandbox.
- Default caps for a run (tokens, minutes, depth).
- Watchdog: drop or revive as a simulation.
- Frontend owner: confirm the additive contract fields (SPEC section 7); where the service is deployed and who sets the keys.
- Rotate the NVIDIA, Tavily and Nebius keys that were pasted in chat, after the demo.

## Blockers
- None. Keys are in `research/.env` (gitignored).
