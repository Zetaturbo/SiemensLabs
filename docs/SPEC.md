# Research agent: spec

Owner: Jose. Folder: `research/`. Status: draft, revised after the decision to separate research from the
database chatbot. Items marked [DECIDE] need a team or owner decision. Items marked PROPOSED change a
contract in `docs/ARCHITECTURE.md` and need the team's agreement.

## 1. Goal

The supplier dataset is a mockup: names are synthetic (`SUPP_xxxxx`) and cannot be tied to real companies.
So the product has two clearly separated capabilities:

1. **Database mode (default, research OFF).** The chatbot and the screens work only on the supplier
   database. No web access, no research tools.
2. **Research mode (opt-in, research ON).** The buyer names a **real company**. A multi-agent pipeline
   researches it on the web and returns a **verified, source-linked risk report**.

Research results are **standalone**. A report is never attached to a `SUPP_` record and never changes
dataset scores.

Out of scope for this spec: the supplier query tools, the UI shell, deployment (other owners).

## 2. The two modes

```text
                         BUYER
                           |
                           v
                        WEB UI
                           |
          +----------------+------------------+
          | research OFF (default)            | research ON (button or tab)
          v                                   v
+----------------------+           +--------------------------+
|    DATABASE MODE     |           |      RESEARCH MODE       |
| chatbot + supplier   |           | research pipeline        |
| query tools          |           | (real companies only)    |
+----------+-----------+           +------+-------------+-----+
           |                              |             |
           v                              v             v
  Mock supplier dataset          Live web or      Evidence store
  (SUPP_xxxxx)                   sandbox          (claims, sources,
                                                   reports)
                                                       |
                                                       v
                                               Verified report --> UI
```

| | Database mode (OFF) | Research mode (ON) |
|---|---|---|
| Data | Mock supplier dataset only | Live web (real companies) or sandbox (fictional demo companies) |
| Chatbot tools | Supplier query tools | Research tools: start, status, confirm entity, report, claims |
| Subject | `SUPP_xxxxx` suppliers | A company name typed by the buyer |
| Output | Tables, rankings, grounded answers | Verified report with citations |
| Cost and latency | Seconds | Minutes, token budget, hard caps |

Rules:

- **Hard separation.** When research is OFF, the orchestrator does not register research tools at all
  (a server-side guarantee, not a prompt instruction). Same the other way round: research runs never
  receive the supplier tools.
- **No auto-switching.** The chatbot never starts research on its own. If the buyer asks about a real
  company while research is OFF, it answers that this is outside the database and may return a UI action
  `suggest_research` (PROPOSED) that the UI renders as a "Run research on <company>" button.
- **Synthetic names are refused.** A name matching `SUPP_xxxxx` is rejected with `SYNTHETIC_ENTITY`
  (PROPOSED error code). The pipeline never searches the web for them.
- **Simulated data is labeled.** Anything from the sandbox carries `simulated: true` and the UI shows
  a "simulated" badge everywhere.

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
| 1 | Turns research on, enters a company | `research_company(company)` | `job_id`, status `queued` |
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
`get_research_report`. The `depth` input is not used (one run type).

PROPOSED additions (additive, nothing existing breaks):

- `research_company`: new error `SYNTHETIC_ENTITY` for `SUPP_` names. No supplier link: reports are standalone.
- `get_research_status.progress[]` entries gain `agent` and `ts`; new `step` values `verify` and `report`.
- `get_research_report` gains: per flag `dimension`, `claim_ids`, `verification`; top-level `simulated`,
  `claims[]` and `verification_summary`. See `mocks/research_report.json`.
- New tools: `get_research_claims(job_id)` and `list_research_jobs()` (history for a Research tab).
- Chat context (ARCHITECTURE section 7) gains `research_enabled` (bool). The orchestrator registers
  research tools only when it is true.
- UI actions (ARCHITECTURE section 7): `suggest_research` with `company_name` (shown as a button when
  research is OFF), and `open_research_report` with `job_id`. The existing `start_research` stays for
  mode ON.

## 8. Tracing and evaluation

- MLflow: one trace per run; spans for plan, each agent, each tool call, each verification.
  Log model, budget, cost, latency, number of claims, verified-claim rate. Tag runs with `simulated`. Check the current MLflow tracing docs for exact API calls.
- Persist the same events in our own DB for the UI.
- Automatic metric: verified-claim rate. Manual test set: a few real companies with known public events.
- Tables: `research_runs`, `claims`, `sources`, `reports`, `run_events`.
  [DECIDE] Storage: Postgres (Supabase or Neon) preferred, because jobs change at runtime and a deployed
  host may restart or sleep. Do not rely on an in-memory job store.

## 9. Watchdog and score overlay: paused

The earlier plan had a background watchdog that monitored a watchlist and adjusted dataset scores through
an overlay table. That needs research evidence attached to a dataset supplier, which conflicts with the
decision that synthetic suppliers cannot be linked to real companies. It is **not part of the MVP**.

Kept here in case the team wants it later, and only as a labeled simulation on sandbox companies:

- A scheduler calls `run_monitor_cycle`, hashes sources, triages new documents with a cheap model,
  escalates to the full pipeline above a severity threshold.
- Verified claims would produce adjustments in a separate overlay (never overwriting baseline scores):
  `effective[dim] = clamp(baseline[dim] + sum(adjustments[dim]), 0, 100)`.
- Extra tables would be `score_adjustments`, `score_history`, `monitor_state`.

Decide whether to drop this entirely or revive it as a simulated demo. Tickets R12 and R13 are paused.

## 10. Open decisions

- [DECIDE] UI placement: chat toggle or Research tab (section 3). Recommendation: tab plus chat hand-off.
- [DECIDE] LLM provider and credits (team recommends one provider for chatbot and agent), then model tiers.
- [DECIDE] Runtime storage for jobs and events (section 8).
- [DECIDE] Which 2 fictional sandbox companies (section 5).
- [DECIDE] Default caps for a run (tokens, minutes, depth).
- [DECIDE] Watchdog: drop or revive as a simulation (section 9).
- Verify before relying on them: free tiers and rate limits of the sources and APIs chosen per lane.
