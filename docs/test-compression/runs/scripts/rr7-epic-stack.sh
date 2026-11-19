#!/bin/bash
O=/private/tmp/claude-501/-Users-jazelly-Desktop-github-my-proj-agentic-react/34f1a0f1-f92e-47ab-b8c7-ea3534f779ef/scratchpad/bench-arms
W=/private/tmp/claude-501/-Users-jazelly-Desktop-github-my-proj-agentic-react/34f1a0f1-f92e-47ab-b8c7-ea3534f779ef/scratchpad/ws
REPO=rr7-epic-stack SHA=893610db76127fb5a5f1ffa786bee6b050637429 NODEV=22.22.2
TOOLS="vite 7.3.1, vitest 4.0.18, react-router 7.16.0, @playwright/test 1.58.1 (pinned by repo), prisma 6.19.2, react 19.2.4, npm 10.9.7; agentic-node 0.2.0 @ 4e604d36ccc0c7b3b491a02c28f654e474bce60b (agentic-node arm only)"
BROWSER="n/a (vitest jsdom)"
source "$O/scripts/lib.sh"
BASE="Workspace scratchpad/ws/rr7-base: APFS copy of the pinned clone after npm ci + harbor.postInstall (cp .env.example .env, prisma migrate deploy, prisma generate --sql) from the previous pass."
# Restores DB / test fixture state written by test runs (snapshot taken once before this pass).
RESTORE="rm -rf playwright-report test-results prisma/data.db other/cache.db tests/fixtures/email tests/fixtures/github/users.0.local.json tests/fixtures/openimg tests/fixtures/uploaded tests/prisma && tar xf $W/rr7-base.state.tar"
only=${1:-all}
if [ $only = all ] || [ $only = a ]; then
cmdcase a-vitest-happy - "$W/rr7-base" "npx vitest run" "$BASE prisma/data.db, other/cache.db and generated tests/ fixtures restored from a snapshot before every run. playwright.config.ts carries the launchOptions.executablePath override (irrelevant to vitest)." "Repo Vitest suite (vitest 4.0.18)." "$RESTORE"
fi
if [ $only = all ] || [ $only = b ]; then
cmdcase b-double-check-fail rr7-epic-stack/state-double-check-button "$W/rr7-doublecheck" "npx vitest run app/utils/misc.use-double-check.test.tsx" "Workspace scratchpad/ws/rr7-doublecheck = rr7-base copy + task setup.edits (previous pass)." "The task's cmd check."
fi
if [ $only = all ] || [ $only = c ]; then
BROWSER="Chrome for Testing 159.0.8154.6 (chromium-headless-shell revision 1255) launched by @playwright/test 1.58.1"
cmdcase c-e2e-playwright - "$W/rr7-base" "PORT=5220 npm run test:e2e:run" "$BASE @playwright/test 1.58.1 pointed at the latest Chromium via projects[chromium].use.launchOptions.executablePath=~/Library/Caches/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-mac-arm64/chrome-headless-shell in the scratch copy's playwright.config.ts (its own revision chromium-1208 is deleted). PORT=5220 to stay in the assigned port range (playwright.config reads PORT). The npm pretest:e2e:run hook runs npm run build as part of the captured command, so the production build is rebuilt (and its output captured) on every run. DB/fixture state restored from a snapshot before every run (warm-up and captured)." "manifest commands.e2e. The script itself sets CI=true (cross-env), so webServer = npm run start:mocks against the production build. Reporter is html (writes playwright-report/, not opened)." "$RESTORE"
fi
if [ $only = all ] || [ $only = d ]; then
BROWSER="Chrome for Testing 159.0.8154.6 (chromium-headless-shell revision 1255) driven by Playwright 1.65.1 (pw-latest)"
devcase d-hydration rr7-epic-stack/hydration-heading-viewport-attr "$W/rr7-hydration" "PORT=5221 npm run dev" "http://localhost:5221/" "Workspace scratchpad/ws/rr7-hydration = rr7-base copy + task setup.edits (previous pass). PORT=5221 env (server/index.ts reads PORT)." "Default Playwright viewport 1280x720, so the client renders data-viewport=xl."
fi
