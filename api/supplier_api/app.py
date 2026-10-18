"""HTTP entry point: POST /tools/{tool} with the tool input as a JSON object, returns the envelope.

This is the URL frontend/src/lib/data-api/client.ts calls (DATA_API_URL, default http://localhost:8000).

    cd api && uv run uvicorn supplier_api.app:app --port 8000 --reload
"""

import json
import logging

from fastapi import FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

from .db import pool
from .envelope import ToolError, fail
from .tools import PLANNED_TOOLS, TOOLS

log = logging.getLogger(__name__)

app = FastAPI(title="Supplier data service", version="0.1.0")


@app.get("/health")
def health():
    with pool().connection() as conn:
        n = conn.execute("select count(*) as n from supplier_wide").fetchone()["n"]
    return {"ok": True, "suppliers": n, "tools": list(TOOLS)}


@app.post("/tools/{tool}")
async def call_tool(tool: str, request: Request):
    if tool not in TOOLS:
        message = f"{tool} is not implemented yet" if tool in PLANNED_TOOLS else f"Unknown tool: {tool}"
        return JSONResponse(fail("INTERNAL", message), status_code=404)
    try:
        body = await request.body()
        inp = json.loads(body) if body else {}
        if not isinstance(inp, dict):
            raise ValueError("body must be a JSON object")
    except ValueError as e:
        return JSONResponse(fail("INVALID_FILTER", f"Invalid request body: {e}"), status_code=400)
    # Tools use blocking psycopg calls, so keep them off the event loop
    return JSONResponse(await run_in_threadpool(run_tool, tool, inp))


def run_tool(tool: str, inp: dict) -> dict:
    """Run one tool and always return an envelope; tool errors become {ok: false}."""
    try:
        with pool().connection() as conn:
            return TOOLS[tool](conn, inp)
    except ToolError as e:
        return fail(e.code, e.message)
    except Exception:
        log.exception("tool %s failed", tool)
        return fail("INTERNAL", f"{tool} failed; see the service log")
