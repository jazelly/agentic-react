#!/bin/bash
# Harbor verifier entrypoint — grades via check.steps (same semantics as lib/task-kit.mjs).
set -uo pipefail
mkdir -p /logs/verifier
echo 0 > /logs/verifier/reward.txt
echo 0 > /logs/verifier/reward.json 2>/dev/null || true

cd /app || { echo "missing /app"; exit 6; }

if node /tests/check-runner.mjs /tests/task-check.json; then
  echo 1 > /logs/verifier/reward.txt
  printf '{"reward":1}\n' > /logs/verifier/reward.json
  exit 0
fi

printf '{"reward":0}\n' > /logs/verifier/reward.json
exit 0
