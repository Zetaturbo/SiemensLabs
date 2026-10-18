# SiemensLabs

Supplier sourcing and risk assessment, built for the Siemens supplier risk challenge.

## What we are building

1. **Product view and vendor assessment.** Start from a whole product, such as a train, and see the parts that need
   sourcing. Clicking a part opens a guided vendor assessment, driven by a chat agent whose tools read our supplier
   database and research, with research API tooling on top of the existing databases.
2. **Shortlist comparison dashboard.** A traditional dashboard for comparing the final shortlisted suppliers. If the
   scores do not separate them well, one button sends the research agent to gather more data for the comparison.
3. **Evaluation set.** A source of truth of questions and answers that we test our agents against over time, to keep
   hallucination as low as possible.

## Repo layout

| Folder       | Contents                                                |
| ------------ | ------------------------------------------------------- |
| `frontend/`  | Web app: product view, assessment chat                  |
| `dashboard/` | Shortlist comparison dashboard with the Research button |
| `api/`       | Data service the agents call as tools                   |
| `research/`  | Research agent service (verified web research)          |
| `db/`        | Local Postgres + pgvector and ingest scripts            |
| `data/`      | Supplier datasets and the evaluation set                |
| `docs/`      | Spec, architecture and handoff notes                    |

## Run it

The quickest way to see everything working needs **no Docker and no database**. Plan about 10 minutes the first time.

### What you need

| Tool | Version | Used for |
| ---- | ------- | -------- |
| Node.js | 20 or newer | main app and dashboard |
| pnpm | `corepack enable` (ships with Node) | main app (the dashboard uses npm) |
| Python | 3.11 or newer | research service |
| Docker and [uv](https://docs.astral.sh/uv/) | optional | only the database and data service (step 4) |

API keys (ask the team for them, never commit them):

| Key | Goes in | Used for |
| --- | ------- | -------- |
| `TAVILY_API_KEY` | `research/.env` | web search and reading pages for real companies |
| `NEBIUS_API_KEY` | `research/.env` | the fast research models |
| `LLM_API_KEY` (NVIDIA) | `research/.env` and `frontend/.env` | backup models for research, and the chat in the main app |

### 1. Start the research service (port 8001)

```bash
cd research
cp .env.example .env            # paste the three keys
python3 -m venv .venv && .venv/bin/pip install fastapi uvicorn pydantic httpx
scripts/serve.sh                # with uv installed you can skip the venv line
curl localhost:8001/health      # shows which keys are configured
```

Leave this terminal running.

### 2. Start the main app: product view and assessment chat (port 3000)

In a second terminal:

```bash
cd frontend
cp .env.example .env            # set LLM_API_KEY and RESEARCH_API_URL=http://localhost:8001
corepack enable                 # once, gives you pnpm
pnpm install
pnpm dev                        # http://localhost:3000
```

Keep `DATA_API_MOCK=1` (the default): supplier data then comes from the CSV files, so no database is needed.

### 3. Try it

- Open http://localhost:3000, click a part on the train, or go straight to
  http://localhost:3000/cases/case_brake_system, and type `Research Knorr-Bremse` in the chat. A real run takes
  about one to one and a half minutes and ends in a report with sources.
- Other things to type: `Research Wabtec Corporation`, or `Research Fennic Railway Brakes GmbH` (a simulated demo
  company, about 30 seconds, no web search).
- The shortlist dashboard is a separate app, see [Shortlist comparison dashboard](#shortlist-comparison-dashboard)
  below. It uses the same research service.

With `RESEARCH_API_URL` empty the main app plays a recorded Knorr-Bremse report instead, and other companies fail with
a clear message.

### 4. Optional: database and data service

Only needed to run the data tools against Postgres instead of the CSV files.

```bash
docker compose -f db/docker-compose.yml up -d --wait   # Postgres on port 5433
uv run --with "psycopg[binary]" db/ingest.py            # load supplier data (safe to re-run)
cd api && uv run uvicorn supplier_api.app:app --port 8000
```

Then in `frontend/.env` set `DATA_API_MOCK=0` and `DATA_API_URL=http://localhost:8000`. More detail:
[api/README.md](api/README.md), [frontend/README.md](frontend/README.md), [research/README.md](research/README.md).

### Ports and checks

| Port | What |
| ---- | ---- |
| 3000 | main app (`frontend/`) |
| 3001 | shortlist dashboard (`dashboard/`) |
| 8000 | data service (`api/`, optional) |
| 8001 | research service (`research/`) |
| 5433 | Postgres (optional) |

Checks: `cd frontend && pnpm typecheck && pnpm lint`, `cd research && .venv/bin/pip install pytest && .venv/bin/python -m pytest`,
`cd dashboard && npm test`.

### If something does not work

- **The research block shows an error or never finishes:** run `curl localhost:8001/health` and check that
  `tavily_configured`, `nebius_configured` and `llm_configured` are true. Missing keys are the usual cause.
- **Port already in use:** stop the other process, or change the port (`PORT=...` in `research/.env`, `-p` for Next).
- **The chat does not answer:** `LLM_API_KEY` is missing in `frontend/.env`.
- **`pnpm` not found:** run `corepack enable` once, or `npm i -g pnpm`.
- Each real research run uses up to 70 Tavily requests, so avoid repeating it many times.

## Shortlist comparison dashboard

A separate Next.js app in `dashboard/`, so it never conflicts with the chat app in `frontend/`. It compares the 12 real
brake companies in `data/brakes/source/real_brake_suppliers.csv` (real names, simulated scores). Each shortlisted
company has a **Research** button that runs the research service and shows its verified findings under the risk
scores; research never changes the scores.

### Run the dashboard

1. Add your API keys:
   ```bash
   cp research/.env.example research/.env
   cp dashboard/.env.example dashboard/.env.local
   ```
   In `research/.env`, fill in `LLM_API_KEY` (NVIDIA), `TAVILY_API_KEY` and `NEBIUS_API_KEY`. Never commit `.env`
   files.

2. Start the research service (no database needed, the dashboard reads the brake CSV directly):
   ```bash
   research/scripts/serve.sh                     # http://localhost:8001
   ```

3. Start the dashboard in a second terminal:
   ```bash
   cd dashboard && npm install && npm run dev    # http://localhost:3001
   ```

If you skip the keys and the research service, the dashboard still runs and the Research button plays a sample report.
Checks: `cd dashboard && npm test && npm run typecheck && npm run build`.
