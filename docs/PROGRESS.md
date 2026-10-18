# Progress

Update this after every ticket. Claude Code reads it at the start of each session.

## Status
- Branch `research/job-tools`, based on `integration` (the trunk, see `docs/BRANCHES.md`). It changes only `research/`, `docs/`, `mocks/` and `CLAUDE.md`.
- The four tools the frontend calls are implemented and tested: `research_company`, `get_research_status`, `confirm_entity`, `get_research_report`.
- Sources and models are chosen and measured on real pages: `docs/SOURCES_AND_MODELS.md`.
- Watchdog and score overlay are paused (SPEC section 9, tickets R12 and R13).

## Done
- R0 to R9 (see `docs/TICKETS.md`): scaffold, models and mocks, source adapters, sandbox with two simulated brake suppliers, lane agents,
  verifier, report writer, job API, planner, GLEIF entity resolution.
- `SUPP_` and `BRK_` id guard (`SYNTHETIC_ENTITY`).
- Live runs: Knorr-Bremse on the real web in about 1 minute, Fennic Railway Brakes (simulated) in about 30 seconds.
- 58 tests, no keys needed.

## Next
- Model quality pass (parked by the owner): verifier agreement, Nemotron Super and Ultra reruns, live agent-loop timing.
- R19: real verified Knorr-Bremse report to replace the canned replay. R20: Dockerfile. R21: sanctions list screening. R10: follow-up searches.
- Postgres job store once Docker is available.

## Open decisions
- Default caps for a run (now 4 minutes, 5 tool calls per lane, 40 Tavily calls; set by `RESEARCH_*` env vars).
- Watchdog: drop or revive as a simulation.
- Frontend owner: confirm the additive contract fields (SPEC section 7); where the service is deployed and who sets the keys.
- Rotate the NVIDIA, Tavily and Nebius keys that were pasted in chat, after the demo.

## Blockers
- None. Keys are in `research/.env` (gitignored).
