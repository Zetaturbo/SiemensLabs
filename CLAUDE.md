# SiemensLabs

Hackathon project for the Siemens challenge "Smart Supplier Selection for Trains":
a UI to filter, rank and compare up to 20 suppliers, a data-grounded chatbot, and a
research agent that produces source-backed risk reports. Deliverables: repo, 2-minute
demo video, live deployed app with jury login.

## Team and ownership
- UI owner: `frontend/` (workflow screens, comparison views, chat panel, login, deployment, LLM orchestration)
- Data owner: `api/` (database, supplier query tools / MCP server, sourcing profiles, evaluation)
- Jose (research agent + watchdog): `research/`

I work on branch `research-agent` and only edit `research/`, `docs/`, `mocks/research_*`.
Never edit another owner's folder without asking me first.

## Contracts (the rule that keeps us parallel)
Components talk only through the contracts in `docs/ARCHITECTURE.md` sections 5 and 6,
plus the proposed additions in `docs/SPEC.md` (marked PROPOSED until the team agrees).
Build against `mocks/` until real services exist.

## Data conventions (from the team)
- Field names are snake_case. All risk scores are 0-100 and higher = worse.
  `delivery_rating` and `order_confirmation_rate` are higher = better.
- The dataset has no price, category, country or region.
- Supplier names (`SUPP_xxxxx`) are synthetic. Never try to research them on the web.
- Real companies are researched live. Fictional demo companies use the sandbox
  source adapter and must be labeled "simulated" everywhere in the UI.

## Research agent rules
- An agent may only emit a claim that includes a verbatim quote from a fetched source.
- The verifier must confirm every claim (string match on the stored page text,
  then an LLM support check) before it can appear in a report or change a score.
- Reports and score changes use verified claims only. Every report sentence cites claim IDs.
- Never overwrite baseline dataset scores. Adjustments live in a separate overlay table.
- Red-flag drill-down has hard caps: depth 2, token budget, time limit per run.
- Trace every run (plan, agent calls, tool calls, verification) with MLflow, and also
  store events in our own database. The UI must not depend on the MLflow server.
- Reports about real companies show source dates and verification status. Do not
  present unverified claims as facts.

## How to work
- At the start of every session read this file, `docs/SPEC.md` and `docs/PROGRESS.md`.
- One ticket from `docs/TICKETS.md` per session. Commit small and often.
- After each ticket update `docs/PROGRESS.md` (done, next, blockers).
- Secrets live in `.env` (never commit). Keep `.env.example` current.
- Ask before deleting files or making structural changes.
- Use `/clear` between tickets; the docs hold the state, not the chat.

## Where things are
- `docs/SPEC.md`: what the research agent and watchdog do (read first)
- `docs/TICKETS.md`: ordered task list
- `docs/PROGRESS.md`: current status
- `docs/ARCHITECTURE.md`, `docs/procurement-research.md`: the team's shared architecture and research notes
- `mocks/`: example responses for each contract
- `data/`: challenge CSV and criteria description
