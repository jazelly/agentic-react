#!/bin/bash
O=/private/tmp/claude-501/-Users-jazelly-Desktop-github-my-proj-agentic-react/34f1a0f1-f92e-47ab-b8c7-ea3534f779ef/scratchpad/bench-arms
C=/Users/jazelly/Desktop/github/my-proj/agentic-react/benchmark/runs/caps
REPO=tanstack-start-trellaux SHA=e7358c36d8cde5275fc3c32cd5fd5bbf7ecc30f9 NODEV=24.15.0
TOOLS="vite 8.3.8, @tanstack/react-start 1.169.5 (pinned by manifest harbor.preInstall), @tanstack/react-router 1.170.46, react 19.3.1, pnpm 10.6.5; agentic-node 0.2.0 @ 4e604d36ccc0c7b3b491a02c28f654e474bce60b (agentic-node arm only)"
BROWSER="Chrome for Testing 159.0.8154.6 (chromium-headless-shell revision 1255) driven by Playwright 1.65.1 (pw-latest)"
source "$O/scripts/lib.sh"
only=${1:-all}
if [ $only = all ] || [ $only = a ]; then
devcase a-dev-happy - "$C/trellaux-base" "pnpm --ignore-workspace dev --port 5210 --strictPort" "http://localhost:5210/" "Config hardcodes port 3000; overridden via --port 5210 --strictPort. Workspace: copy of examples/react/start-trellaux with harbor.preInstall applied (@tanstack/react-start -> 1.169.5) and pnpm install --ignore-workspace (no lockfile, versions float) from the previous pass." ""
fi
if [ $only = all ] || [ $only = b ]; then
PW_TZ=UTC devcase b-hydration tanstack-start-trellaux/hydration-home-updated-at "$C/trellaux-hydration" "pnpm --ignore-workspace dev --port 5211 --strictPort" "http://localhost:5211/" "Port via --port 5211 --strictPort. Browser context timezoneId=UTC (host is ACDT): a client in a different timezone than the server is the realistic trigger; same-zone clients render the same toLocaleTimeString() and no mismatch fires. Workspace: trellaux-base copy + task setup.edits (previous pass)." ""
fi
