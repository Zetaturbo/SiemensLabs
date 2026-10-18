# SiemensLabs

Siemens supplier risk challenge.

## Run it

### Database (local Postgres + pgvector)

Requires Docker and [uv](https://docs.astral.sh/uv/).

```bash
docker compose -f db/docker-compose.yml up -d --wait   # starts Postgres on port 5433, applies db/migrations on first start
uv run --with "psycopg[binary]" db/ingest.py            # loads suppliers, scores and metric definitions (safe to re-run)
docker exec -it siemenslabs-db psql -U siemens -d siemenslabs
```

To reset the database: `docker compose -f db/docker-compose.yml down -v`.

Tables: `suppliers`, `supplier_scores` (long format), `metric_definitions` (from the criteria markdown), `sources`.
Views: `supplier_overview` (one row per supplier with all scores as JSON).
