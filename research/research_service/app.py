"""HTTP entry point: POST /tools/{tool} with the tool input as a JSON object, returns the envelope.

This is the URL frontend/src/lib/research/client.ts calls (RESEARCH_API_URL, for example http://localhost:8001).

    cd research && uv run uvicorn research_service.app:app --port 8001 --reload
"""

import json
import logging
import os

from fastapi import FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

from .config import load_settings
from .context import Sandbox
from .envelope import ToolError, fail
from .tools import PLANNED_TOOLS, TOOLS

log = logging.getLogger(__name__)

app = FastAPI(title="Research service", version="0.1.0")


@app.get("/health")
def health():
    settings = load_settings()
    return {"ok": True, "tools": list(TOOLS), "planned": PLANNED_TOOLS, "llm_configured": settings.llm_configured,
            "tavily_configured": bool(settings.tavily_api_key), "nebius_configured": bool(os.environ.get("NEBIUS_API_KEY")),
            "store_dir": str(settings.store_dir), "max_concurrent_runs": settings.max_concurrent_runs, "max_run_seconds": settings.max_run_seconds,
            "simulated_companies": [c["name"] for c in Sandbox().companies]}


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
        return JSONResponse(fail("INVALID_INPUT", f"Invalid request body: {e}"), status_code=400)
    return JSONResponse(await run_in_threadpool(run_tool, tool, inp))


def run_tool(tool: str, inp: dict) -> dict:
    """Run one tool and always return an envelope; tool errors become {ok: false}."""
    try:
        return TOOLS[tool](inp)
    except ToolError as e:
        return fail(e.code, e.message)
    except Exception:
        log.exception("tool %s failed", tool)
        return fail("INTERNAL", f"{tool} failed; see the service log")
