# Research agent: spec

Owner: Jose. Folder: `research/`. Status: draft, aligned with the frontend that is already built. Items marked
[DECIDE] need a team or owner decision. Items marked PROPOSED change a contract in `docs/ARCHITECTURE.md` and
need the team's agreement.

## 1. Goal

The supplier dataset is a mockup (`SUPP_xxxxx` names). The research agent works on **real companies**: the buyer
names a company, a multi-agent pipeline researches it on the web and returns a **verified, source-linked risk
report**.

How it connects to the rest follows what the frontend already does:

- Research is a chat skill (`research_company`) plus a research panel in the Finalists stage.
- The buyer can link a dataset supplier to a real company in the UI. The link travels with the job as an optional
  `supplier_id` and is only a label for us. The database will later include a few real companies, which makes the
  link meaningful without any change on our side.
- Research never changes dataset scores.

Deferred, not blocking: an on/off switch or a separate tab that keeps research apart from the database chatbot
(section 3). The service has no mode concept, so either choice works.

Out of scope for this spec: the supplier query tools, the UI shell, deployment of the frontend (other owners).

## 2. How research fits the app

```text
BUYER --> WEB UI --> chatbot (LLM with skills)
                       |
                       |-- supplier skills ----> Data service (api/) --> Postgres: supplier data
                       |
                       '-- research_company ---> Research service (research/)
                                                    |-- pipeline (section 4)
                                                    |-- live web or sandbox sources
                                                    '-- Postgres: research_* tables
```

Rules:

- **Synthetic names are refused.** A name matching `SUPP_xxxxx` is rejected with `SYNTHETIC_ENTITY`. The pipeline
  never searches the web for them (the frontend skill already tells the model the same).
- **The supplier link is a label.** `supplier_id` is accepted, stored and echoed back. It never influences a
  search, a claim or a score.
- **Simulated data is labeled.** Anything from the sandbox carries `simulated: true` and the UI shows a
  "simulated" badge everywhere.
- **Independent services.** The research service does not call the data service and the data service does not
  call it. The frontend orchestrates both.

## 3. Where research lives in the UI [DECIDE]

Not decided yet: a toggle/button in the chat, or a separate Research tab. The contract is the same either
way, so the frontend can start with either and switch.

## 4. The pipeline

```text
INPUT  company name (+ optional country, website)
  |
  v
[0] CHECK THE NAME
  |     looks like SUPP_xxxxx?  --yes-->  REFUSED (synthetic dataset name)
  v     no
[1] FIND THE COMPANY
  |     several matches?  --yes-->  buyer picks one, then the run continues
  v     no / picked
[2] PLAN  (strong model)
  |     research questions, which lanes to use, budget
  v
[3] SPECIALIST LANES  (all run at the same time, each with its own source list)
  |   +--------+---------+--------+---------+
  |   |  News  | Company | Legal  | Science |
  |   +--------+---------+--------+---------+
  v
[4] EXTRACT CLAIMS
  |     statement + severity + source + exact quote copied from the page
  v
[5] VERIFY EVERY CLAIM
  |     (a) is the quote in the saved page text?   (exact string match)
  |     (b) does the quote support the statement?  (LLM check)
  |
  |-- high-severity claim and limits not reached? --yes--> [6] DIG DEEPER
  |                                                          primary document,
  |                                                          second source
  |                                                          |
  |                                  new claims go back to [4] and [5]
  |                                  (max depth 2, token budget, time limit)
  | no
  v
[7] WRITE THE REPORT
  |     verified claims only, every sentence cites claim IDs
  v
OUTPUT  report + claims + verification summary
        (every run is also saved and traced)
```

This is a demo, so there is one run type: the full pipeline including the red-flag loop. Caps (tokens,
minutes, depth 2) come from config.

### Lanes

| Lane | Sources (closed list) | Dataset dimensions it mirrors |
|---|---|---|
| news | news search only | media_sentiment, market_sentiment, labor_stability |
| company | official site, press releases, annual and sustainability reports | governance_risk, esg_performance, operational_resilience |
| legal | sanctions lists, enforcement notices, court records | compliance_risk, geopolitical_risk |
| science | papers, patents, recall and accident notices | quality_risk, safety_incident |

Each lane has a tool whitelist (for web search, an allowed-domains list). The dimension column only
tags claims so a report can be grouped by the same risk families the UI already uses.

### Job lifecycle (what the UI sees)

| Step | Buyer / UI | Call | What comes back |
|---|---|---|---|
| 1 | Asks the chat to research a company, or uses the research panel | `research_company(company)` | `job_id`, status `queued` |
| 2 | (only if the name is ambiguous) sees candidates, picks one | `get_research_status(job_id)` then `confirm_entity(job_id, candidate_id)` | status `needs_disambiguation` with a candidate list, then the run continues |
| 3 | Watches the live run, repeated until done | `get_research_status(job_id)` | progress events (`agent`, `step`, `ts`), status `running` then `done` |
| 4 | Opens the report | `get_research_report(job_id)` | verified report, claims, verification summary |

Jobs and events are persisted outside memory, so a run survives a restart and the UI can reopen old reports.

## 5. Source adapters

One interface (`fetch`, `search` with allowed domains), two implementations, chosen per run:

- `live`: the real web, for real companies named by the buyer.
- `sandbox`: reads a folder of simulated documents (news item, press release, court notice,
  sanctions entry, report excerpt) written for **fictional demo companies**. Never real brands or companies.
  Everything from the sandbox is labeled "simulated" in the UI.

The sandbox exists so the demo works when the live web is slow or flaky. It is selected server-side
when the company name matches the sandbox registry; the UI only needs to show the `simulated` flag.
It is no longer tied to `SUPP_` IDs. [DECIDE] which 2 fictional companies (suggestion: one with a clear
red flag and one clean).

## 6. Claim schema

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

## 7. Contract with the team (maps to ARCHITECTURE.md section 6)

Already compatible: `research_company`, `get_research_status`, `confirm_entity`,
`get_research_report`.

How the frontend already calls us (`frontend/src/lib/research/client.ts`, same convention as the data service):

- `POST {RESEARCH_API_URL}/tools/<tool>` with the input as a JSON object; the response is the envelope
  `{ok, data, meta, error}`. Also `GET /health`. FastAPI started with uv, like `api/`.
- With `RESEARCH_API_URL` empty the frontend plays a canned replay (Knorr-Bremse), so it works without us.
- It still sends `focus` and `depth: "standard"` on every start. The service accepts and ignores both
  (one run type, no financial lane).
- It polls `get_research_status` every 2.5 s for up to 15 minutes, then calls `get_research_report`.
  Its types mirror ARCHITECTURE section 6 exactly, so keep the existing report and progress fields as they
  are and only add fields.

PROPOSED additions (additive, nothing existing breaks):

- `research_company`: optional `supplier_id` (the frontend already sends it), echoed in status and report, never
  used for scoring. New error `SYNTHETIC_ENTITY` for `SUPP_` names.
- `get_research_status.progress[]` entries gain `agent` and `ts`; new `step` values `verify` and `report`.
- `get_research_report` gains: per flag `dimension`, `claim_ids`, `verification`; top-level `simulated`,
  `claims[]` and `verification_summary`. See `mocks/research_report.json`.
- New tools: `get_research_claims(job_id)` and `list_research_jobs()` (history for a Research tab).
- Only if on/off gating is built later: `research_enabled` in the chat context and a `suggest_research` UI action.
  Add `open_research_report` with `job_id` if the UI wants to deep-link a report. The existing `start_research`
  action stays.

## 8. Tracing and evaluation

- MLflow: one trace per run; spans for plan, each agent, each tool call, each verification.
  Log model, budget, cost, latency, number of claims, verified-claim rate. Tag runs with `simulated`. Check the current MLflow tracing docs for exact API calls.
- Persist the same events in our own DB for the UI.
- Automatic metric: verified-claim rate. Manual test set: a few real companies with known public events.
- Storage: the team's Postgres + pgvector from `db/` (`DATABASE_URL`, same database as the data service).
  Our tables are prefixed `research_` (`research_runs`, `research_claims`, `research_sources`,
  `research_reports`, `research_events`) and have no foreign key to `suppliers`. The existing `documents`
  and `sources` tables carry a `supplier_id` link, so we do not reuse them. Our migration lives in
  `research/migrations/`, so we do not touch the data owner's `db/`. Do not rely on an in-memory job store.

## 9. Watchdog and score overlay: paused

The earlier plan had a background watchdog that monitored a watchlist and adjusted dataset scores through
an overlay table. Changing dataset scores from research evidence is outside the current scope. It is
**not part of the MVP**.

Kept here in case the team wants it later, and only as a labeled simulation on sandbox companies:

- A scheduler calls `run_monitor_cycle`, hashes sources, triages new documents with a cheap model,
  escalates to the full pipeline above a severity threshold.
- Verified claims would produce adjustments in a separate overlay (never overwriting baseline scores):
  `effective[dim] = clamp(baseline[dim] + sum(adjustments[dim]), 0, 100)`.
- Extra tables would be `score_adjustments`, `score_history`, `monitor_state`.

Decide whether to drop this entirely or revive it as a simulated demo. Tickets R12 and R13 are paused.

## 10. Open decisions

- [DECIDE] UI placement: chat toggle or Research tab (section 3). Recommendation: tab plus chat hand-off.
- [DECIDE] LLM: the frontend already uses an OpenAI-compatible endpoint (`LLM_BASE_URL`, `LLM_API_KEY`,
  `LLM_MODEL`, default NVIDIA Nemotron 3 Ultra). Reuse the same variables. Confirm the agent works with that
  model (tool calling, long context) and that there are enough credits.
- Deferred, not blocking: keep research apart from the chatbot with an on/off switch or a tab (section 3).
- Later: the database will include a few real companies, so the supplier-to-company link needs no work from us.
- The frontend replay shows a canned report for a real company (Knorr-Bremse). Demo reports for fictional
  companies must be labeled simulated.
- [DECIDE] Which 2 fictional sandbox companies (section 5).
- [DECIDE] Default caps for a run (tokens, minutes, depth).
- [DECIDE] Watchdog: drop or revive as a simulation (section 9).
- Verify before relying on them: free tiers and rate limits of the sources and APIs chosen per lane.
