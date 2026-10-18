# Tickets (research agent and watchdog)

Work one ticket per session, in order unless blocked. Tick the box and update `docs/PROGRESS.md`
when done. Details and definitions are in `docs/SPEC.md`.

## Phase 1: foundations (do first)

- [ ] **R0. Scaffold `research/`.** Python project (FastAPI), `.env.example`, config for LLM provider,
  tests folder, README section "how to run". Acceptance: `uvicorn` starts and `/health` returns ok.
- [ ] **R1. Mocks and schemas.** Pydantic models for claim, report, progress (SPEC sections 5 and 6).
  `mocks/research_report.json` and `mocks/research_progress.json` validate against the models.
  Commit on day one so the UI owner can build against them.
- [ ] **R2. Source adapter interface.** `fetch(url)`, `search(query, allowed_domains)`, with a
  `live` and a `sandbox` implementation and a per-lane domain whitelist. Acceptance: same call works in both modes.
- [ ] **R3. Sandbox corpora.** For 2-3 demo suppliers, write 4-6 simulated documents each
  (news, press release, court notice, sanctions entry, report excerpt), fictional names only, labeled
  simulated. Blocked until the data owner picks the SUPP IDs (SPEC section 12).

## Phase 2: the pipeline

- [ ] **R4. One lane end to end (news).** Search, fetch, extract claims with verbatim quotes, store in the ledger.
- [ ] **R5. Verifier.** Deterministic quote match on stored page text plus LLM support check;
  statuses verified / partial / unsupported / contradicted. Acceptance: a fabricated quote is rejected.
- [ ] **R6. Report writer.** Verified claims only, claim IDs on every sentence, output matches the contract
  (`get_research_report` with the proposed extra fields).
- [ ] **R7. Job API.** `research_company`, `get_research_status`, `get_research_report`, `confirm_entity`.
  Jobs persisted outside memory. Acceptance: a run survives a server restart.
- [ ] **R8. Planner and parallel lanes.** Planner (strong model) assigns lanes; company, legal and science
  lanes run in parallel with their closed source lists.
- [ ] **R9. Entity resolution.** Candidates and `needs_disambiguation` flow.
- [ ] **R10. Red-flag drill-down.** Follow-up tasks for high-severity claims, with hard caps (depth 2, budget,
  time) and second-source corroboration.
- [ ] **R11. Tracing and event persistence.** MLflow trace per run, metrics (verified-claim rate, cost,
  latency), tag `trigger`; same events stored in our DB for the UI.

## Phase 3: watchdog and score updates

- [ ] **R12. Monitor cycle.** `run_monitor_cycle` endpoint (cron-callable), content-hash diff, cheap-model triage,
  escalate to deep pipeline above the severity threshold.
- [ ] **R13. Score overlay.** `score_adjustments`, `score_history`, alerts, adjustment formula (SPEC section 7),
  `simulate_event` for the demo. Blocked until the data owner agrees the overlay and runtime storage.
- [ ] **R14. Dataset vs Reality payload.** Per-dimension dataset score vs evidence score for the UI radar.

## Phase 4: quality and extras

- [ ] **R15. Evaluation.** Automatic verified-claim rate; manual test set of a few real companies with known public events.
- [ ] **R16 (stretch). Quick Scan batch** for up to 20 suppliers in parallel.
- [ ] **R17 (stretch). Ask the evidence** chat grounded on one run's claims.
- [ ] **R18 (stretch). Devil's Advocate and shortlist memo.**

## Needed from teammates

- Data owner: demo SUPP IDs, overlay read path, runtime storage decision.
- UI owner: confirm the proposed report fields, progress steps and the `open_research_report` action.
- Team: LLM provider and credits.
