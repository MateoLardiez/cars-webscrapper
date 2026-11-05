#!/usr/bin/env bash
# Installs the Scrapling MCP server inside this folder (no global install).
# Requires: uv (https://docs.astral.sh/uv/). Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")"

uv sync --frozen

# Browsers live in the repo, not in ~/.cache
export PLAYWRIGHT_BROWSERS_PATH="$PWD/.browsers"
.venv/bin/python -m playwright install chromium
.venv/bin/python -m patchright install chromium

echo "Done. On Linux you may also need system libraries (needs sudo):"
echo "  sudo $PWD/.venv/bin/python -m playwright install-deps chromium"
