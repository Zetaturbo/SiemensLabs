# Supplier data service

Python service that answers the supplier data tools from Postgres. Contract: `docs/ARCHITECTURE.md`
section 5. The frontend calls it at `POST {DATA_API_URL}/tools/<tool>` with the tool input as JSON and
gets back `{ok, data, meta, error}`.

## Run it

Requires the database from `db/` (see the root README), with migrations `002_supplier_wide.sql` and
`003_run_sql_reader.sql` applied.

```bash
cd api
uv run uvicorn supplier_api.app:app --port 8000 --reload
curl -X POST localhost:8000/tools/compare_suppliers -d '{"ids": ["SUPP_00012", "SUPP_00450"]}'
```

`DATABASE_URL` and `RUN_SQL_DATABASE_URL` default to the local Docker database (see `.env.example`).

If the database was created before these migrations existed, apply them once:

```bash
docker exec -i siemenslabs-db psql -U siemens -d siemenslabs < db/migrations/002_supplier_wide.sql
docker exec -i siemenslabs-db psql -U siemens -d siemenslabs < db/migrations/003_run_sql_reader.sql
```

## Tools

All 11 contract tools are built and reproduce the frontend mocks exactly.

| Tool | Answers |
|---|---|
| `get_metadata` | What does each field mean, which direction is worse, which family, official weight |
| `list_profiles` | Sourcing profiles and their weights |
| `get_suppliers` | Rows by supplier id |
| `filter_suppliers` | Screening: conditions, sort, paging, total match count |
| `rank_with_profile` | Ranking under a profile or custom weights (normalized to sum 1), with the move vs the default ranking |
| `compare_suppliers` | Side by side, best and worst per field, family scores, largest differences |
| `explain_supplier` | Why a score is high or low: percentile and contribution vs the dataset mean per field |
| `find_similar` | Alternatives: nearest on the 18 scores, optionally strictly lower on chosen fields |
| `kraljic_position` | Kraljic quadrant per supplier, plus dataset counts. Medium sourcing risk counts as low (team lead decision) |
| `get_dataset_stats` | Mean, std, quartiles, min, max, level counts, optionally for a filtered segment |
| `run_sql` | Fallback for the chatbot only: one SELECT on the `suppliers` view, max 200 rows |

## How it reads the database

All tools query the materialized view `supplier_wide`: one row per supplier, contract field names
(`financial_health`, `total_risk_index_level`, ...), plus the derived profile fields `delivery_risk`,
`confirmation_risk` and `change_risk`. `db/ingest.py` refreshes it after each load.

Field names in tool inputs are checked against `supplier_api/catalog.py` and values are bound as
parameters, so inputs never become raw SQL. Connections are read-only.

`run_sql` runs chatbot-written SQL, so it never uses the owner connection. It logs in as `supplier_reader`
(migration 003), which can only `SELECT` from `chat.suppliers`: the same rows and field names as
`supplier_wide`, queried as `suppliers`. Statements time out after 5 seconds. Change the role's password
before using a shared or hosted database.

Families, sourcing profiles and official weights live in `supplier_api/catalog.py`. They are copied from
`frontend/scripts/gen-mocks.py`; keep the two in sync.

## Tests

```bash
cd api
uv run pytest
```

Tests run against the live database. `tests/fixtures/mocks` holds the frontend mocks (copied from the
`integration` branch), and every built tool must reproduce its mock from Postgres.
