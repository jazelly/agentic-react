Diagnostic runs (NOT captured cases) for vite-shadcn-admin d-bad-import, agentic-node arm, same env/scripts as the captured run.
- d-outsidedir-*: AN_EXTRA="AGENTIC_NODE_DIR=/private/tmp/claude-501/-Users-jazelly-Desktop-github-my-proj-agentic-react/34f1a0f1-f92e-47ab-b8c7-ea3534f779ef/scratchpad/bench-arms/diag/d-anlogs" (log dir outside the Vite root) -> browser 10 messages, no reload.
- d-repro-*: default log dir (<cwd>/.agentic-node) again -> browser 14 messages, reload reproduced (logs in d-repro-anlogs/).
Command: ARM=agentic-node NODEV=24.15.0 [AN_EXTRA=...] scripts/dev.sh <term> <browser> benchmark/runs/caps/shadcn-badimport "pnpm --ignore-workspace dev --port 5202 --strictPort" http://localhost:5202/tasks
