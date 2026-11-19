#!/bin/bash
O=/private/tmp/claude-501/-Users-jazelly-Desktop-github-my-proj-agentic-react/34f1a0f1-f92e-47ab-b8c7-ea3534f779ef/scratchpad/bench-arms
C=/Users/jazelly/Desktop/github/my-proj/agentic-react/benchmark/runs/caps
T=/Users/jazelly/Desktop/github/my-proj/agentic-react/benchmark/tasks/vite-shadcn-admin
REPO=vite-shadcn-admin SHA=e16c87f213a5ba5e45964e9b67c792105ec74d26 NODEV=24.15.0
TOOLS="vite 8.0.8, vitest 4.1.4 (browser mode, @vitest/browser-playwright 4.1.4, playwright 1.59.1 pinned by repo), react 19.2.5, pnpm 10.6.5; agentic-node 0.2.0 @ 4e604d36ccc0c7b3b491a02c28f654e474bce60b (agentic-node arm only)"
BROWSER="Chrome for Testing 159.0.8154.6 (Playwright revision 1255)"
source "$O/scripts/lib.sh"
VDEV="Vitest browser provider pointed at the latest Chromium via launchOptions.executablePath=~/Library/Caches/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-mac-arm64/chrome-headless-shell in the scratch copy's vite.config.ts (playwright({ launchOptions: { executablePath } })); repo pins playwright 1.59.1 whose own revision is deleted."
CLEAN='find src -type d -name __screenshots__ -prune -exec rm -rf {} +'
only=${1:-all}
if [ $only = all ] || [ $only = a ]; then
cmdcase a-test-happy - "$C/shadcn-base" "pnpm --ignore-workspace test" "$VDEV Runs in benchmark/runs/caps/shadcn-base (plain APFS copy of the pinned clone incl. node_modules, .git removed) instead of benchmark/repos/vite-shadcn-admin so the config override never touches the pinned clone." "Repo own test suite." "$CLEAN"
fi
if [ $only = all ] || [ $only = b ]; then
cmdcase b-signout-full-suite-fail vite-shadcn-admin/state-signout-keeps-user "$C/shadcn-signout" "pnpm --ignore-workspace test" "$VDEV" "Full repo suite with the injected bug (hidden test absent) - what an agent sees running pnpm test. __screenshots__ dirs from failing runs are deleted before every run." "$CLEAN"
cmdcase b-signout-hidden-test-fail vite-shadcn-admin/state-signout-keeps-user "$C/shadcn-signout" "pnpm --ignore-workspace exec vitest run --browser.headless src/stores/__bench__" "$VDEV" "Hidden test hidden/auth-store.reset.test.ts copied to src/stores/__bench__/ as runChecks does (removed afterwards). runChecks sets CI=1; CI is unset here per brief. __screenshots__ dirs deleted before every run." "$CLEAN; mkdir -p src/stores/__bench__ && cp $T/state-signout-keeps-user/hidden/auth-store.reset.test.ts src/stores/__bench__/"
rm -rf "$C/shadcn-signout/src/stores/__bench__"
fi
if [ $only = all ] || [ $only = c ]; then
devcase c-tasks-crash vite-shadcn-admin/runtime-tasks-status-crash "$C/shadcn-crash" "pnpm --ignore-workspace dev --port 5201 --strictPort" "http://localhost:5201/tasks" "Port 5201 via --port 5201 --strictPort." ""
fi
if [ $only = all ] || [ $only = d ]; then
devcase d-bad-import - "$C/shadcn-badimport" "pnpm --ignore-workspace dev --port 5202 --strictPort" "http://localhost:5202/tasks" "Port 5202 via --port 5202 --strictPort. AD-HOC change, not from any task: src/features/tasks/components/tasks-columns.tsx line 7 from './data-table-row-actions' -> './data-table-row-action' (typo, file does not exist); workspace is the same plain APFS copy used by the previous control-only pass." ""
fi
