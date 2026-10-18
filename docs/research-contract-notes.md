# Research service contract notes

Checked on 2026-10-18 by running the research service (`research/`, commit 9c1de89) on port 8001 next to the frontend and
calling every tool with real inputs. Envelope `{ok, data, meta, error}` and the six tools match ARCHITECTURE.md section 6
closely; the differences are listed below. For the teammate who owns `research/`: the service-side items are suggestions,
nothing in `research/` was changed.

## What ran

- `GET /health`: `ok`, tools `research_company`, `get_research_status`, `confirm_entity`, `get_research_report`,
  `get_research_claims`, `list_research_jobs`; nothing planned. No Postgres needed: jobs live in memory plus one JSON file
  per job (`RESEARCH_STORE_DIR`, default `research/var/jobs`). `uv run pytest`: 62 passed.
- Keys: Tavily (`api.tavily.com`) and Nebius Token Factory (`api.tokenfactory.nebius.com`) for every model role.
- Live runs (real web research, Tavily search and extract, closed source lists):

| Job | Company | Time | Claims | Verified | Overall |
| --- | --- | --- | --- | --- | --- |
| res_e95a8c | Knorr-Bremse (DE, supplier SUPP_03267) | 39 s | 22 | 13 | elevated |
| res_a77437 | Wabtec Corporation (US) | 41 s | 20 | 10 | moderate |
| res_3ad54d | Wabtec Corporation, started from the brake case chat ("Research SUPP_09772") | 68 s | 22 | 9 | elevated |
| res_8ab6a9 | Fennic Railway Brakes GmbH (sandbox, simulated) | 22 s | 18 | 12 | high |

- Refusals: `research_company {"company_name": "SUPP_03267"}` and `"BRK_0046 Something"` return `SYNTHETIC_ENTITY`;
  unknown job ids return `UNKNOWN_JOB`.
- Blocked host in this environment: `api.gleif.org` (entity resolution). The service then researches the name as typed:
  no legal entity, no LEI, never `needs_disambiguation`. Allow it on the deployed stack. Page reading goes through Tavily
  extract, so the source websites themselves were not needed.

## Mismatches on the service side (field, expected, got)

| # | Field | Expected | Got |
| --- | --- | --- | --- |
| 1 | `research_company.focus`, `.depth` | Section 6.1 inputs that narrow the run | accepted and ignored; every run uses all four lanes |
| 2 | `research_company.country` | ISO 3166 alpha-2 | ISO code or an English name; an unknown name is silently dropped (the run continues without a country). Suggest `INVALID_INPUT` |
| 3 | `list_research_jobs` rows | enough to list jobs: company, country, status, dates, result | `job_id, company_name` (as typed), `status, supplier_id, simulated, created_at`; no resolved legal name, country, `updated_at` or `overall_assessment` |
| 4 | `report.sources[]` | `{title, url, publisher, accessed}` with a readable title | `title` is the URL, `publisher` and `accessed` are null. Flag sources also use the URL as title (claims' `source_title` is never filled) |
| 5 | `report.company.website` | absolute URL | `knorr-bremse.com` without scheme in the shipped mock; `confirm_entity` overwrites the chosen candidate's website with the job's website (GLEIF candidates have none anyway) |
| 6 | Writer grounding (flag titles, summary) | only facts in the cited verified claims | only digits are checked. Live run res_e95a8c: title "Blocked Haldex Acquisition in 2017" while the claims say the Commission opened an in-depth investigation and Knorr-Bremse offered commitments; summary says "antitrust actions in the U.S. and EU regarding no-poach agreements" (the EU claims are about the Haldex merger review) and "a 2020 safety investigation also linked a Knorr-Bremse system to a near-total brake failure" (claim c_018 only says the Knorr-Bremse EBCU datalogger recorded the low brake pressure). Suggest a verifier pass on titles and the summary, or the claim-text fallback whenever a title adds a verb the claims lack |
| 7 | Flag severity vs attribution | severity reflects the company's own conduct | c_018 is a verified quote but marks Knorr-Bremse `elevated` on safety for an accident in which its device only logged the data |
| 8 | `get_research_report` on a failed job | a distinct code | `INTERNAL` with the run's error message (the frontend treats it as failed) |
| 9 | `research/README.md` | mocks at `research/mocks/` (also how the brief named them) | the files are at the repository root, `mocks/` |
| 10 | `uv sync` in `research/` | clean tree | creates `research/uv.lock`, which is neither committed nor ignored |

Shapes that match: progress steps (`step, message, agent, ts`), candidates (plus an extra `registration`), report body with
the section 6.3 fields plus `job_id, supplier_id, simulated, claims, verification_summary`, flags with `dimension,
claim_ids, verification`. `research_company` on a company with an active job returns that job with `meta.reused: true`.
Severities and the eight categories match.

## Fixed on the frontend side

- `src/lib/research/types.ts`: `auto_confirm`, `supplier_id`, progress `agent`/`ts`, status `supplier_id`/`simulated`,
  claims (with category and status), flag `dimension`/`claim_ids`/`verification`, report `job_id`/`supplier_id`/
  `simulated`/`claims`/`verification_summary`, job summaries.
- `src/lib/research/client.ts`: keeps the service's error code (`ResearchError`), maps an unreachable service to
  `UNAVAILABLE`, sends `auto_confirm: true` by default, lists jobs with `list_research_jobs` (replay run as fallback),
  marks a job failed on `UNKNOWN_JOB` or a failed report read, and in replay mode refuses `SUPP_`/`BRK_` ids with the
  service's own sentence.
- Rendering (`RiskFlagList`, `SourceList`): category assessments, verified claim counts, claim totals, readable titles
  for URL-only sources (host and path), publisher and access date merged from the flag sources, simulated label.
- Replay (`src/lib/research/replay.ts`): the shipped live run `mocks/research_report_knorr_bremse.json` (job res_7d99aa,
  2026-10-18, 17 claims, 12 verified, LEI 5299001GRRO0Z25YZT52) unchanged. The fresh run res_e95a8c was not used as the
  fixture: GLEIF was blocked here (no legal entity, no LEI) and its summary and one title state things its claims do not
  (items 6 and 7).
- Links (`RESEARCH_LINKS` in `src/lib/cases/seed.ts`): brake pins SUPP_03267 Knorr-Bremse AG, SUPP_09772 Wabtec
  Corporation, SUPP_01995 Akebono Brake Industry (the three rail rows of `real_brake_suppliers.csv`); BRK_0049 and
  BRK_0029 map to the service's simulated sandbox twins. `scripts/check-seed.ts` requires exactly one linked entity on the
  brakes case, so only Knorr-Bremse is in `linkedEntities`; the skill uses the full table.
