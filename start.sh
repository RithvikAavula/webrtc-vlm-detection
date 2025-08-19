#!/usr/bin/env bash
set -euo pipefail
MODE="${MODE:-wasm}" # wasm | server (future)
export MODE

echo "[start] Building and starting (MODE=$MODE)"
docker compose up --build
