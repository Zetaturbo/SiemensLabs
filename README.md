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




