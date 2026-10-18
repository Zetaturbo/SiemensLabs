# Progress

Update this after every ticket. Claude Code reads it at the start of each session.

## Status
- Repo structure created (`frontend/`, `api/`, `research/`, `docs/`, `data/`).
- Team architecture and research notes are in `docs/ARCHITECTURE.md` and `docs/procurement-research.md`.
- Spec and tickets are aligned with the built frontend: research is the `research_company` skill plus a research
  panel, the supplier-to-company link is a label, on/off gating and a separate tab are deferred.
- Watchdog and score overlay are paused (SPEC section 9, tickets R12 and R13).
- Checked the other branches on 2026-10-18 and aligned the docs (details below).
  - `origin/main`: Postgres + pgvector in `db/` (docker, migration 001, ingest). Our storage decision is made:
    same database, `research_*` tables.
  - `origin/feature/data-service`: `api/` FastAPI service, `POST /tools/<tool>`, envelope, uv. 5 of 11 tools built.
    We copy this layout for `research/`.
  - `origin/integration` (frontend): research client with canned replay, `/api/research` routes, polling, chat
    skill `research_company`. Uses `RESEARCH_API_URL`. LLM is an OpenAI-compatible endpoint (`LLM_*`).
  - Decision: adopt the frontend's approach and keep building the service; gating is deferred.
  - `docs/` exists only on our branch; the other branches have `docs/.gitkeep`.
- Mocks drafted: `mocks/research_report.json`, `mocks/research_progress.json`.

## Done
- R0: `research/` scaffold (FastAPI, `POST /tools/<tool>` envelope, `/health`, config from `LLM_*` and `DATABASE_URL`, 3 tests).
  Tested with a Python 3.12 venv because uv is not installed on this machine; `pyproject.toml` is uv-compatible.

- R1: pydantic models in `research/research_service/models.py`; both mocks validate. A flag can only cite verified claims, so the report
  mock was changed: its partial financial claim stays in `claims[]` but is no longer a risk flag.
- R2: source adapters in `research/research_service/sources.py` (Tavily with the closed lane lists enforced twice, sandbox),
  plus an LLM client with retry and model fallback (`llm.py`). 25 tests, no keys needed.

- Models and sources chosen and checked (2026-10-18), locked in `research/config/`:
  - Sources: 38 of 47 candidate domains work end to end through Tavily; 7 dropped (unextractable or empty), 2 rescued by
    advanced extraction. Gaps: EU competition cases, German insolvency notices.
  - Models: per-role order in `models.json`. Nebius (paid) first, free NVIDIA Nemotron Super last as the fallback.
    One smoke run, not a quality benchmark; the verifier needs a real labeled test set (R5, R15).
  - Adapter retries advanced extraction by itself; searches can be narrowed to a subset of a lane's domains.

## Next
- R3: sandbox corpora for 2 fictional companies.
- R4: first lane end to end (news).

## Open decisions
- Watch the Nebius credit balance; the chains fall back to the free NVIDIA tier when it runs out.
- Rotate the NVIDIA, Tavily and Nebius keys that were pasted in chat, after the demo.
- Deferred: on/off gating or a Research tab (SPEC section 3).
- Which 2 fictional companies for the sandbox.
- Default caps for a run.
- Watchdog: drop or revive as a simulation.
- Team agreement on the proposed contract additions (SPEC section 7).

## Blockers
- None for R0 to R3. Contract additions need the UI owner's confirmation before the frontend relies on them.
