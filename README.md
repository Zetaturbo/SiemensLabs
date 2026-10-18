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

Requires Docker and [uv](https://docs.astral.sh/uv/).

```bash
docker compose -f db/docker-compose.yml up -d --wait   # Postgres on port 5433
uv run --with "psycopg[binary]" db/ingest.py            # load supplier data (safe to re-run)
```

Then follow [api/README.md](api/README.md) and [frontend/README.md](frontend/README.md).

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

2. Start the database and the research service:
   ```bash
   docker compose -f db/docker-compose.yml up -d --wait
   research/scripts/serve.sh                     # http://localhost:8001
   ```

3. Start the dashboard in a second terminal:
   ```bash
   cd dashboard && npm install && npm run dev    # http://localhost:3001
   ```

If you skip the keys and the research service, the dashboard still runs and the Research button plays a sample report.
Checks: `cd dashboard && npm test && npm run typecheck && npm run build`.
