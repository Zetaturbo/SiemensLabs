# Brief 11: research agent wired into the product

Branch: `feat/research-integration` from `integration`. Edit only `frontend/src/lib/research/**`,
`frontend/src/app/api/research/**`, `frontend/src/skills/research-company.ts`, `frontend/src/skills/verdict.ts`,
`frontend/src/components/ui-blocks/{risk-flag-list,source-list,verdict,supplier-card}*`, `frontend/src/components/shell/pages/research*`
(the Research page), `frontend/src/lib/cases/seed.ts` (linked entities only), `frontend/README.md` (research section),
`frontend/.env.example`. Do not touch `research/` (the teammate's service; report mismatches instead), the case screen,
the chat panel, the train map, the data layer.

## Why
The teammate's research service (`research/`, read its README and `docs/ARCHITECTURE.md` section 6) now implements
all six tools: `research_company`, `get_research_status`, `confirm_entity`, `get_research_report`,
`get_research_claims`, `list_research_jobs`, at `POST {RESEARCH_API_URL}/tools/<tool>` with the envelope. The frontend
has spoken that contract from day one (`src/lib/research/client.ts`, replay mode when `RESEARCH_API_URL` is empty),
but it has never been run against the real service, and the canned Knorr-Bremse replay report states facts from model
memory (known issue in the handoff). Real brake companies now exist in `data/brakes/source/real_brake_suppliers.csv`
(`BRKR_0001..0012`, e.g. Brembo, Knorr-Bremse, Wabtec, ZF); the service refuses invented `SUPP_`/`BRK_` entities
(`SYNTHETIC_ENTITY`) and supports `auto_confirm` for ambiguous names.

## Build
1. Run the service here: `research/README.md` run steps with the keys from the supervisor's env files
   (`LLM_*` from `.env.nebius`, `TAVILY_API_KEY` from `.env.keys`), port 8001; `DATABASE_URL` may be absent (check
   whether the service needs Postgres; if it does and none is available, say so and use whatever in-memory or
   file mode it offers). Check which outbound hosts it needs (Tavily, source sites) and whether they are reachable;
   if web search is blocked, use the service's simulated or replayed companies for the contract test and say so.
2. Contract check: call each of the four tools the frontend uses with real inputs and diff the responses against
   `src/lib/research/types.ts`. Fix the frontend side for any field the service names differently or adds
   (`auto_confirm`, claims, categories on claims, ISO country codes), keeping the replay mode working. Write every
   service-side mismatch down for the teammate (field, expected, got) in the report and in a short
   `docs/research-contract-notes.md`.
3. Wire the flows: (a) the `research_company` skill passes `auto_confirm: true` by default and handles
   `needs_disambiguation` by showing the candidates as chips (existing ui action `confirm_entity` path); (b) the
   finalists flow's Research action and the Research page (`/research`) list real jobs from `list_research_jobs`
   with status, company, date, and open the report; (c) the research result block (RiskFlagList, SourceList, Verdict
   when it carries research) renders the real report shape: overall assessment, category assessments, verified
   flags with source links, claims count; minimal style, no new chrome; (d) `linkedEntities` on the brakes case map
   the pinned `BRK_` suppliers to real companies from `real_brake_suppliers.csv` where a sensible match exists
   (document the mapping in the seed; Knorr-Bremse stays), so "research this supplier" on a brake finalist researches
   a real company and `SUPP_`/`BRK_` without a link get the service's refusal shown as one sentence.
4. Replace the canned replay: the service ships a real Knorr-Bremse report from a live run
   (`research/mocks/research_report_knorr_bremse.json`, 17 claims with sources). Convert it into the frontend's
   replay fixture (`src/lib/research/replay.ts`) with its real sources and dates, so the demo's replay no longer
   states facts from model memory. If a real run also succeeds here (web search host `api.tavily.com` is blocked in
   this container at the time of writing), prefer the fresh one and note the run date. Never invent facts.
5. `frontend/README.md`: research section updated (modes, env, how to run the service next to the frontend).

## Verify
With the service on 8001 and `RESEARCH_API_URL` set: start a research job from the chat on the brake case for a
linked real company, see progress, see the report block; `/research` lists the job; a `SUPP_` id without link gets
the refusal sentence; with `RESEARCH_API_URL` empty the replay still works. The four checks and `check:seed` pass.
Report under 300 words: what ran for real, contract mismatches found and fixed or reported, what remains for the
deployed stack.
