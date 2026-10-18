# Progress

Update this after every ticket. Claude Code reads it at the start of each session.

## Status
- Repo structure created (`frontend/`, `api/`, `research/`, `docs/`, `data/`).
- Team architecture and research notes are in `docs/ARCHITECTURE.md` and `docs/procurement-research.md`.
- Research agent and watchdog spec written (`docs/SPEC.md`); tickets in `docs/TICKETS.md`.
- Mocks drafted: `mocks/research_report.json`, `mocks/research_progress.json`.

## Done
- (nothing yet)

## Next
- R0: scaffold `research/`.
- R1: validate mocks against the pydantic models and commit.

## Open decisions
- LLM provider and credits.
- Runtime storage for jobs and the score overlay (Postgres preferred).
- Which SUPP IDs are the demo suppliers (data owner).
- Team agreement on the proposed contract additions (SPEC section 6).

## Blockers
- R3 waits on the demo SUPP IDs. R13 waits on the overlay agreement.
