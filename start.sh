#!/usr/bin/env bash
# ================================================================
#  YT Link Harvester — Portable Launcher for Linux & macOS
# ================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "========================================================"
echo "  YT Link Harvester — Download Studio"
echo "========================================================"
echo ""

# Locate Python
if command -v python3 >/dev/null 2>&1; then
    PY_CMD="python3"
elif command -v python >/dev/null 2>&1; then
    PY_CMD="python"
else
    echo "[ERROR] Python 3 is required but not found."
    echo "Please install Python 3: https://www.python.org/downloads/"
    exit 1
fi

echo "Python detected: $($PY_CMD --version)"

# Check yt-dlp
if ! command -v yt-dlp >/dev/null 2>&1 && ! $PY_CMD -m yt_dlp --version >/dev/null 2>&1; then
    echo "[INFO] yt-dlp not found. Attempting user install via pip..."
    $PY_CMD -m pip install --user -r requirements.txt || true
fi

# Launch server
echo ""
echo "Starting local server..."
echo "Press Ctrl+C to stop."
echo "========================================================"

exec $PY_CMD "$SCRIPT_DIR/server.py" "$@"
