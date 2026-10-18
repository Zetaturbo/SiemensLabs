# Research agent and watchdog: spec

Owner: Jose. Folder: `research/`. Status: draft. Items marked [DECIDE] need a team or owner decision.
Items marked PROPOSED change a contract in `docs/ARCHITECTURE.md` and need the team's agreement.

## 1. Goal

One multi-agent research pipeline with two entry points:

1. **Research (chat trigger):** the buyer names a real company, or asks something that needs
   outside information. The chatbot switches to research mode and launches the pipeline.
   Output: a verified, source-linked risk report.
2. **Watchdog (scheduled trigger):** in the background, the same pipeline monitors a small
   watchlist and updates risk scores from newly published information, without being asked.

Both write to the same evidence tables, so the chatbot can later answer "why did this change?".

Out of scope for this spec: the supplier query tools, the UI shell, deployment (other owners).

## 2. One pipeline, two triggers

```
run_pipeline(
  company, supplier_id | null,
  mode:     "scan" | "deep",
  trigger:  "schedule" | "chat",
  apply_scores: bool,
  sources:  "live" | "sandbox",
  budget:   { tokens, minutes, depth }
) -> { claims, report, score_deltas }
```

- Chat trigger: `deep`, `apply_scores=false` by default (the report can offer "apply to scores").
- Schedule trigger: `scan` on every watchlist supplier, escalate to `deep` only when
  triage finds something relevant, `apply_scores=true`.

## 3. Stages

1. **Entity resolution.** Find candidate legal entities for the name. If ambiguous, return
   `needs_disambiguation` with candidates (contract section 6.2) and wait for `confirm_entity`.
2. **Planner (strong model).** Produces a research plan: questions, lanes to use, budget.
3. **Specialist lanes (run in parallel, closed source lists).**
   | Lane | Sources | Dataset dimensions it informs |
   |---|---|---|
   | news | news search only | media_sentiment, market_sentiment, labor_stability |
   | company | official site, press releases, annual and sustainability reports | governance_risk, esg_performance, operational_resilience |
   | legal | sanctions lists, enforcement notices, court records | compliance_risk, geopolitical_risk |
   | science | papers, patents, recall and accident notices | quality_risk, safety_incident |
   | financial (optional) | insolvency registers, public filings | financial_health, credit_rating |
   Each lane gets a tool whitelist (for web search, an allowed-domains list).
4. **Evidence ledger.** Every finding is stored as a claim (section 5).
5. **Red-flag drill-down.** If a claim has severity `high`, the planner creates follow-up
   tasks (find the primary document, look for corroboration). Hard caps: depth 2, token budget,
   time limit per run. High-severity claims need a second independent source to count as verified.
6. **Verifier.** For every claim: (a) deterministic check that the quote appears in the stored
   source text; (b) LLM check that the quote supports the statement. Status becomes
   `verified`, `partial`, `unsupported` or `contradicted`.
7. **Report writer.** Sees verified claims only. Every sentence cites claim IDs.
8. **Score adjustment** (only when `apply_scores`): see section 7.

## 4. Source adapters

One interface, two implementations, chosen per run:

- `live`: the real web, for real companies named by the buyer.
- `sandbox`: reads a folder of simulated documents (news item, press release, court notice,
  sanctions entry, report excerpt) written for our demo suppliers. Fictional names only,
  never real brands or companies. Everything from the sandbox is labeled "simulated" in the UI.

Demo suppliers: reuse 2-3 existing `SUPP_xxxxx` IDs with moderate scores so a change is
visible, and attach sandbox documents to them. [DECIDE] which IDs (data owner picks from the CSV).

## 5. Claim schema

```json
{
  "claim_id": "c_014",
  "run_id": "res_8f2a",
  "dimension": "financial_health",
  "statement": "The company filed for insolvency protection in March 2025.",
  "severity": "high",
  "quote": "verbatim text from the source",
  "source_url": "https://...",
  "source_title": "...",
  "publisher": "...",
  "published": "2025-03-14",
  "retrieved_at": "2026-10-18T10:00:00Z",
  "agent": "news",
  "status": "verified",
  "corroborated_by": ["c_021"],
  "simulated": false
}
```

## 6. Contract with the team (maps to ARCHITECTURE.md section 6)

Already compatible: `research_company`, `get_research_status`, `confirm_entity`,
`get_research_report`; `depth` quick = scan, standard = deep; `start_research` UI action.

PROPOSED additions (additive, nothing existing breaks):

- `research_company` gets optional `supplier_id` and `apply_scores` (default false).
- `get_research_status.progress[]` entries gain `agent` and `ts`; new `step` values `verify` and `report`.
- `get_research_report` gains: per flag `dimension`, `claim_ids`, `verification`;
  top-level `claims[]` and `verification_summary`. See `mocks/research_report.json`.
- New tools (section 6.4): `get_research_claims(job_id)`, `list_monitored()`, `run_monitor_cycle()`,
  `get_score_history(supplier_id)`, `list_alerts()`, and demo-only `simulate_event(supplier_id, doc_id)`.
- New UI action: `open_research_report` with `job_id`.

## 7. Score adjustments (watchdog)

Never overwrite baseline scores. Store adjustments in an overlay:

```
effective[dim] = clamp(baseline[dim] + sum(adjustments[dim]), 0, 100)
adjustment     = severity_weight * confidence * recency_decay   (capped per run)
```

- Only verified claims count. Big jumps need a second source.
- `score_history`: old value, new value, delta, claim IDs, run ID, timestamp, trigger.
- Large changes can be flagged "pending buyer review" instead of auto-applied.
- Total risk index is recomputed with the `official_weight` values from `get_metadata`.
- [DECIDE with data owner] The data service must read the overlay (effective = baseline + adjustments).
  Percentiles and dataset means stay on the baseline.

Tables: `research_runs` (with `trigger`), `claims`, `sources`, `reports`, `score_adjustments`,
`score_history`, `monitor_state` (last checked, source hashes).
[DECIDE] Storage for these runtime tables: Postgres (Supabase or Neon) preferred, because jobs and
history change at runtime and a deployed host may restart or sleep. Do not rely on an in-memory job store.

## 8. Watchdog loop

1. A scheduler calls `run_monitor_cycle` every N minutes (cron-style endpoint). The demo also has a
   "Run cycle now" button, because free hosts can sleep.
2. For each watchlist supplier, fetch sources and compare content hashes with the last cycle.
3. Triage new documents with a cheap fast model: relevant or not, dimension, rough severity.
4. If severity passes the threshold, launch the deep pipeline.
5. Verified claims produce score adjustments and an alert.

## 9. Research modes (what the UI can offer)

| Mode | What it does | Priority |
|---|---|---|
| Deep Dive | Full pipeline with drill-down and verified report | MVP |
| Quick Scan | About 1 minute: sanctions, adverse news, insolvency sweep, traffic lights | MVP |
| Dataset vs Reality | Compares per-dimension dataset score with evidence; flags discrepancies | Should |
| Batch compare | Quick Scan for up to 20 shortlisted suppliers in parallel, heat-map | Should |
| Ask the evidence | Chat grounded only in the evidence of one run | Should |
| Monitor | Watchlist, alerts feed, score timeline with event markers | Should |
| Devil's Advocate | Strongest case against the chosen supplier, for the justification memo | Stretch |
| Memo | Auto-generated shortlist memo with verified claims and dataset metrics | Stretch |
| Ownership graph, what-if scenarios | Shared parents, concentration risk, event scenarios | Stretch |

UI ideas for the frontend owner: live run view with one swim-lane per agent; report with inline
citation chips (hover shows quote, source, date, verified badge; click opens a source panel with the
quote highlighted); radar of dataset score vs evidence score; transparency badge ("37 claims, 31 verified,
4 partial, 2 dropped"); agent-generated UI as typed JSON (RiskCard, Timeline, Table, Chart) rendered from a
fixed component library, never raw HTML.

## 10. Tracing and evaluation

- MLflow: one trace per run; spans for plan, each agent, each tool call, each verification.
  Log model, budget, cost, latency, number of claims, verified-claim rate. Tag runs with `trigger`.
  Check the current MLflow tracing docs for exact API calls.
- Persist the same events in our own DB for the UI.
- Automatic metric: verified-claim rate. Manual test set: a few real companies with known public events.

## 11. Demo flow (2 minutes)

1. Dashboard shows a monitored demo supplier at a moderate score.
2. Trigger "Simulate event": the watchdog detects it, the score changes, a toast links to the source.
3. In chat: "why did it change?" gets a grounded answer with citations.
4. Ask about a real company: the chatbot switches to research mode and the live pipeline runs;
   the report opens with clickable evidence.

## 12. Open decisions

- [DECIDE] LLM provider and credits (team recommends one provider for chatbot and agent).
- [DECIDE] Runtime storage for jobs and overlay (section 7).
- [DECIDE] Which SUPP IDs are the demo/monitored suppliers.
- [DECIDE] Scoring parameters: severity weights, recency decay, per-run cap, review threshold.
- Verify before relying on them: free tiers and rate limits of the sources and APIs chosen per lane.
