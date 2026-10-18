# SiemensLabs

Siemens supplier risk challenge workspace.

## Supplier comparison UI

The Next.js app in `frontend/` provides a searchable preliminary supplier result list and a side-by-side shortlist comparison. It starts with the 20 lowest Total Risk Index scores from the anonymized dataset; search can find any supplier by ID or name. Buyers can compare up to 20 suppliers at once.

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

Tests read the repository-root `dataset.csv` and check real supplier values, full-dataset search, preliminary ranking, comparison winners, and the 20-supplier shortlist limit.
