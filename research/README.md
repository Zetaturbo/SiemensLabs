# Research service

Python service that researches a real company on the web and returns a verified, source-linked risk report. Spec: `docs/SPEC.md`.
The frontend calls it at `POST {RESEARCH_API_URL}/tools/<tool>` with the tool input as JSON and gets back `{ok, data, meta, error}`,
the same convention as the data service in `api/`. With `RESEARCH_API_URL` empty the frontend plays a canned replay instead.

## Start it

```bash
cd research
cp .env.example .env              # fill TAVILY_API_KEY, LLM_API_KEY (NVIDIA free tier) and NEBIUS_API_KEY
scripts/serve.sh                  # port 8001; uses uv, else .venv, else python3
curl localhost:8001/health        # which keys are configured, which simulated companies exist
```

Then set `RESEARCH_API_URL=http://localhost:8001` in `frontend/.env` and ask the chat "research Knorr-Bremse" (real web, about one to two
minutes) or "research Fennic Railway Brakes GmbH" (simulated demo company, under a minute, no Tavily credits, labeled simulated).

Try it without the frontend: `.venv/bin/python scripts/run_research.py "Knorr-Bremse" --country DE --website knorr-bremse.com`.

## Tools

| Tool | What it does |
|---|---|
| `research_company` | Starts a run, returns `job_id` at once. Refuses `SUPP_` and `BRK_` ids (`SYNTHETIC_ENTITY`) |
| `get_research_status` | Status, live progress events, candidates when the company is ambiguous |
| `confirm_entity` | The buyer's choice when several companies match, the run then continues |
| `get_research_report` | The verified report once the job is `done` (`NOT_READY` before) |
| `get_research_claims`, `list_research_jobs` | All claims with their verification status, and the job history |

## Settings

| Variable | Default | Meaning |
|---|---|---|
| `TAVILY_API_KEY` | | Web search and page extraction for real companies |
| `LLM_API_KEY`, `LLM_BASE_URL` | NVIDIA free tier | Last model in every chain, also the frontend's |
| `NEBIUS_API_KEY` | | The paid provider the models in `config/models.json` run on first |
| `RESEARCH_STORE_DIR` | `research/var/jobs` | One JSON file per job, survives a restart |
| `RESEARCH_MAX_CONCURRENT_RUNS` | 3 | Further runs wait in a queue |
| `RESEARCH_MAX_RUN_SECONDS` | 240 | Hard time limit per run, after which the run finishes with what it has |
| `RESEARCH_MAX_LANE_STEPS`, `RESEARCH_MAX_CLAIMS_PER_LANE` | 5, 6 | Tool calls and claims per lane agent |
| `RESEARCH_MAX_TAVILY_CALLS` | 40 | Tavily requests per run (the budget guard) |

## Docker

```bash
docker compose up --build         # uses research/.env, port 8001, jobs in a volume
```

The image has not been built on the machine that wrote it (no Docker daemon was running), so treat the first build as a test.

## Models and sources

`config/sources.json` holds the closed source list per lane, `config/models.json` the model chain per agent role. Why these, with the
measurements: `docs/SOURCES_AND_MODELS.md`. Scripts in `scripts/`: `check_setup.py`, `probe_sources.py`, `build_evidence.py`,
`eval_models.py` (models on real tasks), `bench_pipeline.py` (whole workflow, model combinations), `run_research.py`.

## Tests

```bash
cd research
uv run pytest                      # or .venv/bin/python -m pytest
```

All tests run without keys: a scripted model and the simulated companies stand in for the web and the LLMs.
