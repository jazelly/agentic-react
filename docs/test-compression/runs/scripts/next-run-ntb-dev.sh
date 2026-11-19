#!/bin/bash
# next-turbopack-boilerplate dev+browser cases (needs standalone pglite on 127.0.0.1:5332, migrated).
M=$(cd "$(dirname "$0")" && pwd); C=/Users/jazelly/Desktop/github/my-proj/agentic-react/benchmark/runs/caps
R=next-turbopack-boilerplate
export TOOLS="next 16.4.0 (Turbopack), react 19.2.8, npm $(npm -v), agentic-node 0.2.0 (agentic-node arm only)"
export DEVIATIONS="scratch workspace benchmark/runs/caps/<ws> (task-kit prepareWorkspace with the task setup.edits; reused from the previous control-only pass, edit verified present). Captured \`npm run dev:next -- --port <p>\` instead of \`npm run dev\` (run-p db-server:file dev:* = pglite on fixed port 5432 [held by a Docker container on this host] + Spotlight via npx + next dev). A separate in-memory pglite-server on 127.0.0.1:5332 (migrated with npm run db:migrate) serves DATABASE_URL. CLERK_SECRET_KEY = the repo .env committed placeholder only. AGENTS.md restored to baseline (git checkout) before each arm's warm-up, so Next's one-time 'Generated AGENTS.md' line lands in the warm-up for both arms. .next build cache from earlier runs reused (warm). Before any capture, two exploratory control-env runs in ntb-hyd: the first printed Next 16.4's agent-addressed security-upgrade prompt and exited (instructions not followed); the second printed the one-line 'continuing after the upgrade reminder' warning and served normally."
export READY='Ready in' PRE='git checkout -- AGENTS.md'
DB=postgresql://postgres:postgres@127.0.0.1:5332/postgres
for case in "hydration-locale-switcher ntb-hyd 5303 /" "ssr-current-count-crash ntb-ssr 5302 /counter"; do
  set -- $case
  for arm in control agentic-node; do
    WS=$C/$2 "$M/next-devcap.sh" $R "$1-dev" "$1-browser" $arm $C/$2 $R/$1 "http://localhost:$3$4" -- "DATABASE_URL=$DB npm run dev:next -- --port $3"
  done
done
