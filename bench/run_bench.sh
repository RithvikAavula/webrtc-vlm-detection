#!/usr/bin/env bash
set -euo pipefail
DUR=${1:-30}
echo "[bench] Sleep $DUR sec while you keep the demo running..."
sleep "$DUR"
echo "[bench] Requesting metrics.json write..."
curl -s -X POST http://localhost:3000/metrics -H 'content-type: application/json' \
  -d '{"note":"placeholder; click Save metrics.json in UI for precise data"}' >/dev/null || true
curl -s http://localhost:3000/metrics.json || echo '{"error":"metrics.json not yet written"}'
