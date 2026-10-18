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

| Folder      | Contents                                          |
| ----------- | ------------------------------------------------- |
| `frontend/` | Web app: product view, assessment chat, dashboard |
| `api/`      | Data service the agents call as tools             |
| `db/`       | Local Postgres + pgvector and ingest scripts      |
| `data/`     | Supplier datasets and the evaluation set          |
| `docs/`     | Spec, architecture and handoff notes              |

## Run it

Requires Docker and [uv](https://docs.astral.sh/uv/).

```bash
docker compose -f db/docker-compose.yml up -d --wait   # Postgres on port 5433
uv run --with "psycopg[binary]" db/ingest.py            # load supplier data (safe to re-run)
```

Then follow [api/README.md](api/README.md) and [frontend/README.md](frontend/README.md).
