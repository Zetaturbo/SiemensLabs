# Progress

Update this after every ticket. Claude Code reads it at the start of each session.

## Status
- Repo structure created (`frontend/`, `api/`, `research/`, `docs/`, `data/`).
- Team architecture and research notes are in `docs/ARCHITECTURE.md` and `docs/procurement-research.md`.
- Direction change: the supplier dataset is a mockup, so research is separate from the database chatbot.
  Database mode is the default; research is opt-in (button or tab) and works on real companies only.
  `docs/SPEC.md` and `docs/TICKETS.md` are rewritten for this, with pipeline diagrams.
- Watchdog and score overlay are paused (SPEC section 9, tickets R12 and R13).
- Mocks drafted: `mocks/research_report.json`, `mocks/research_progress.json`.

## Done
- (nothing yet)

## Next
- R0: scaffold `research/`.
- R1: validate mocks against the pydantic models and commit.

## Open decisions
- Chat toggle or Research tab.
- LLM provider and credits.
- Runtime storage for jobs and events (Postgres preferred).
- Which 2 fictional companies for the sandbox.
- Default caps for a run.
- Watchdog: drop or revive as a simulation.
- Team agreement on the proposed contract additions (SPEC section 7).

## Blockers
- None for R0 to R3. Contract additions need the UI owner's confirmation before the frontend relies on them.
