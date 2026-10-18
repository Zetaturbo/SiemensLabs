#!/usr/bin/env bash
# Starts the research service on port 8001 with the keys from research/.env.
#   research/scripts/serve.sh            then set RESEARCH_API_URL=http://localhost:8001 in frontend/.env
# Uses uv when it is installed, otherwise research/.venv, otherwise python3.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a
[ -f .env ] && . ./.env
set +a
args=(research_service.app:app --host "${HOST:-127.0.0.1}" --port "${PORT:-8001}")
if command -v uv >/dev/null 2>&1; then
  exec uv run uvicorn "${args[@]}"
elif [ -x .venv/bin/python ]; then
  exec .venv/bin/python -m uvicorn "${args[@]}"
else
  exec python3 -m uvicorn "${args[@]}"
fi
