# SiemensLabs

Siemens supplier risk challenge workspace.

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
Views: `supplier_overview` (one row per supplier with all scores as JSON), `supplier_wide` (one row per supplier with
contract field names, read by the data service).

Optional: simulated brake suppliers with product offerings and a brake procurement eval set, see
[data/brakes/README.md](data/brakes/README.md). Loaded separately with `db/ingest_brakes.py`.

### Data service

See [api/README.md](api/README.md).

## Supplier comparison UI

The Next.js app in `frontend/` provides a searchable supplier list and a side-by-side shortlist comparison of the 12 real brake companies in `data/brakes/source/real_brake_suppliers.csv` (real names, simulated scores). Buyers can compare up to 20 suppliers at once.

Each shortlisted company has a **Research** button. The app forwards the request to the research service (`research/`) at `RESEARCH_API_URL` and shows the findings as a "Web research findings" section under the risk scores; research never changes the scores. With `RESEARCH_API_URL` unset, the button plays a short replay of the research service's simulated example report, labeled simulated.

Risk scores use the dataset's 0–100 convention (lower is safer). Delivery ratings are performance percentages (higher is better). Purchase order value and sourcing fields are shown as context rather than treated as risk scores.

### Run locally

```sh
cd SiemensLabs/frontend
npm install
npm run dev
```

Open http://localhost:3000.

### Validate

```sh
npm test
npm run typecheck
npm run build
```

Tests read `data/eval/source/supplier_risk_data.csv` and `data/brakes/source/real_brake_suppliers.csv` and check parsing, search, preliminary ranking, comparison winners, the 20-supplier shortlist limit, and the research replay flow.
