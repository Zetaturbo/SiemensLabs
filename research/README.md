# Research service

Python service for company research. Spec: `docs/SPEC.md`. The frontend calls it at
`POST {RESEARCH_API_URL}/tools/<tool>` with the tool input as JSON and gets back `{ok, data, meta, error}`,
the same convention as the data service in `api/`. With `RESEARCH_API_URL` empty the frontend plays a canned replay.

## Run it

Requires [uv](https://docs.astral.sh/uv/) (or Python 3.11+ with the dependencies from `pyproject.toml`).

```bash
cd research
cp .env.example .env            # then fill LLM_API_KEY
uv run uvicorn research_service.app:app --port 8001 --reload
curl localhost:8001/health
```

The data service uses port 8000, so this one uses 8001. Point the frontend at it with
`RESEARCH_API_URL=http://localhost:8001`.

## Tools

| Tool | Status |
|---|---|
| `research_company`, `get_research_status`, `confirm_entity`, `get_research_report`, `get_research_claims`, `list_research_jobs` | Planned (404 "not implemented yet") |

## Tests

```bash
cd research
uv run pytest
```
