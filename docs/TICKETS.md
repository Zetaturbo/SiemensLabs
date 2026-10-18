# Tickets (research agent)

Work one ticket per session, in order unless blocked. Tick the box and update `docs/PROGRESS.md`
when done. Details and definitions are in `docs/SPEC.md`.

Research works on real companies. A buyer-made `supplier_id` link is passed through as a label only.

## Phase 1: foundations (do first)

- [x] **R0. Scaffold `research/`.** Python project laid out like `api/` (FastAPI, uv, `pyproject.toml`,
  `POST /tools/<tool>` returning the `{ok, data, meta, error}` envelope), `.env.example` with `DATABASE_URL` and
  the `LLM_*` variables the frontend uses, tests folder, README section "how to run".
  Acceptance: `uvicorn` starts (port 8001 suggested; the data service uses 8000) and `/health` returns ok.
- [ ] **R1. Mocks and schemas.** Pydantic models for claim, report, progress (SPEC sections 6 and 7).
  `mocks/research_report.json` and `mocks/research_progress.json` validate against the models.
  Commit on day one so the UI owner can build against them.
- [ ] **R2. Source adapter interface.** `fetch(url)`, `search(query, allowed_domains)`, with a
  `live` and a `sandbox` implementation and a per-lane domain whitelist. Acceptance: same call works in both modes.
- [ ] **R3. Sandbox corpora.** For 2 fictional demo companies (one with a clear red flag, one clean),
  write 4-6 simulated documents each (news, press release, court notice, sanctions entry, report excerpt),
  labeled simulated, plus the sandbox registry. No longer blocked on `SUPP_` IDs.

## Phase 2: the pipeline

- [ ] **R4. One lane end to end (news).** Search, fetch, extract claims with verbatim quotes, store in the ledger.
- [ ] **R5. Verifier.** Deterministic quote match on stored page text plus LLM support check;
  statuses verified / partial / unsupported / contradicted. Acceptance: a fabricated quote is rejected.
- [ ] **R6. Report writer.** Verified claims only, claim IDs on every sentence, output matches the contract
  (`get_research_report` with the proposed extra fields). Zero verified claims gives an honest "no verified findings".
- [ ] **R7. Job API and intake guardrail.** `research_company`, `get_research_status`, `get_research_report`,
  `confirm_entity`, `get_research_claims`, `list_research_jobs`. Rejects `SUPP_xxxxx` names with `SYNTHETIC_ENTITY`.
  Accepts an optional `supplier_id` and echoes it back.
  Accepts and ignores `focus` and `depth` (the frontend sends them). Jobs stored in Postgres (`research_*`
  tables, migration in `research/migrations/`). Acceptance: a run survives a server restart, and the frontend
  works against it by setting `RESEARCH_API_URL`.
- [ ] **R8. Planner and parallel lanes.** Planner (strong model) assigns lanes; company, legal and science
  lanes run in parallel with their closed source lists.
- [ ] **R9. Entity resolution.** Candidates and `needs_disambiguation` flow.
- [ ] **R10. Red-flag drill-down.** Follow-up tasks for high-severity claims, with hard caps (depth 2, budget,
  time) and second-source corroboration.
- [ ] **R11. Tracing and event persistence.** MLflow trace per run, metrics (verified-claim rate, cost,
  latency), tag `simulated`; same events stored in our DB for the UI.

## Phase 3: quality and extras

- [ ] **R15. Evaluation.** Automatic verified-claim rate; manual test set of a few real companies with known public events.
- [ ] **R17. Ask the evidence.** Chat grounded on one run's claims only.
- [ ] **R14 (stretch). Evidence vs dataset benchmark.** Per-family evidence assessment next to the dataset distribution.
- [ ] **R16 (stretch). Batch run** for several named real companies in parallel.
- [ ] **R18 (stretch). Devil's Advocate and memo.**

## Paused: watchdog and score updates

Not in the MVP (SPEC section 9). Do not start until the team decides to drop or revive it as a simulation.

- [ ] **R12. Monitor cycle.** `run_monitor_cycle` endpoint, content-hash diff, cheap-model triage,
  escalate to the full pipeline above the severity threshold.
- [ ] **R13. Score overlay.** `score_adjustments`, `score_history`, alerts, adjustment formula, `simulate_event`.

## Needed from teammates

- UI owner: confirm the proposed report fields and progress steps (SPEC section 7). Nothing blocks the build;
  on/off gating and the tab are deferred (SPEC section 3).
- Data owner: nothing blocking now. Research output never touches dataset scores.
- Team: confirm the frontend `LLM_*` endpoint and credits work for the agent; watchdog drop or revive.
