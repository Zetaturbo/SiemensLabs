# Supplier data service

Python service that answers the supplier data tools from Postgres. Contract: `docs/ARCHITECTURE.md`
section 5. The frontend calls it at `POST {DATA_API_URL}/tools/<tool>` with the tool input as JSON and
gets back `{ok, data, meta, error}`.

## Run it

Requires the database from `db/` (see the root README), with migration `002_supplier_wide.sql` applied.

```bash
cd api
uv run uvicorn supplier_api.app:app --port 8000 --reload
curl -X POST localhost:8000/tools/compare_suppliers -d '{"ids": ["SUPP_00012", "SUPP_00450"]}'
```

`DATABASE_URL` defaults to the local Docker database (see `.env.example`).

If the database was created before migration 002 existed, apply it once:

```bash
docker exec -i siemenslabs-db psql -U siemens -d siemenslabs < db/migrations/002_supplier_wide.sql
```

## Tools

| Tool | Status |
|---|---|
| `get_metadata`, `list_profiles`, `get_suppliers`, `filter_suppliers`, `compare_suppliers` | Built, match the frontend mocks exactly |
| `rank_with_profile`, `explain_supplier`, `find_similar`, `kraljic_position`, `get_dataset_stats`, `run_sql` | Not built yet (404) |

## How it reads the database

All tools query the materialized view `supplier_wide`: one row per supplier, contract field names
(`financial_health`, `total_risk_index_level`, ...), plus the derived profile fields `delivery_risk`,
`confirmation_risk` and `change_risk`. `db/ingest.py` refreshes it after each load.

Field names in tool inputs are checked against `supplier_api/catalog.py` and values are bound as
parameters, so inputs never become raw SQL. Connections are read-only.

Families, sourcing profiles and official weights live in `supplier_api/catalog.py`. They are copied from
`frontend/scripts/gen-mocks.py`; keep the two in sync.

## Tests

```bash
cd api
uv run pytest
```

Tests run against the live database. `tests/fixtures/mocks` holds the frontend mocks (copied from the
`integration` branch), and every built tool must reproduce its mock from Postgres.
