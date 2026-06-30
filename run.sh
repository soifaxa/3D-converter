#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d ".venv" ]; then
  python3 -m venv .venv
  .venv/bin/pip install -r requirements.txt
fi

PORT="${PORT:-8000}"

if ss -tlnp 2>/dev/null | grep -q ":${PORT} "; then
  echo "ERROR: Port ${PORT} is already in use."
  echo "Stop the existing server, or run: PORT=8001 ./run.sh"
  exit 1
fi

exec .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port "${PORT}" --reload
