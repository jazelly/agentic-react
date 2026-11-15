#!/bin/bash
set -euo pipefail
cd /app
APP_DIR="${BENCH_APP_DIR:-.}"
node /solution/apply-edits.mjs "/app/${APP_DIR}" /solution/solution-edits.json
git add -A
git -c user.email=oracle@local -c user.name=oracle commit -qm "oracle solution" --allow-empty --no-verify || true
