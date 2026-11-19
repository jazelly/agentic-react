#!/bin/bash
# next-turbopack-boilerplate test/check cases (standalone pglite must NOT be running: the e2e webServer starts its own).
M=$(cd "$(dirname "$0")" && pwd); C=/Users/jazelly/Desktop/github/my-proj/agentic-react/benchmark/runs/caps
R=next-turbopack-boilerplate
NV=$(cat $M/next-ntb-valcmd.txt)
BR="Chromium headless shell 1255 (Chrome for Testing 159.0.8154.6) driven by the repo's pinned Playwright 1.62.1 via launchOptions.executablePath"
OVR="scratch-copy config edit: use.launchOptions.executablePath = <ms-playwright>/chromium_headless_shell-1255/... (latest Chromium; the pinned Playwright 1.62.1's own revision is not installed)"
WSDEV="scratch workspace benchmark/runs/caps/<ws> made with task-kit prepareWorkspace (reused from the previous control-only pass). AGENTS.md restored to baseline before each arm's warm-up (Next under agent markers regenerates it once and may print its agent-addressed upgrade prompt, which then lands in the warm-up)."
c_e2e() { local arm=$1  # happy-path workspace, pglite webServer on 5332
  WS=$C/ntb-happy PRE="git checkout -- AGENTS.md; cp $M/next-ntb-playwright.config.5332.ts playwright.config.ts" \
  TOOLS="@playwright/test 1.62.1, next 16.4.0 (Turbopack dev via webServer), @electric-sql/pglite-socket 0.2.8, npm $(npm -v)" BROWSER="$BR" \
  DEVIATIONS="$WSDEV no task edits. playwright.config.ts webServer \`pglite-server -m 100\` -> \`pglite-server -m 100 -p 5332\` (host 5432 held by Docker), env DATABASE_URL=...:5332 and PORT=5301 (repo default 3008); $OVR. CLERK_SECRET_KEY = the repo .env committed placeholder only." \
  "$M/next-cap.sh" $R playwright-e2e $arm $C/ntb-happy - -- "PORT=5301 DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5332/postgres npm run test:e2e"
}
c_conflict() { local arm=$1
  WS=$C/ntb-happy PRE="git checkout -- AGENTS.md; cp $M/next-ntb-playwright.config.5432.ts playwright.config.ts" \
  TOOLS="@playwright/test 1.62.1, next 16.4.0, @electric-sql/pglite-socket 0.2.8, npm $(npm -v)" BROWSER="$BR (never launched: webServer fails first)" \
  DEVIATIONS="$WSDEV Previous pass ran this in benchmark/repos/$R; now run in the ntb-happy scratch copy with playwright.config.ts = repo original (pglite default port 5432) + $OVR, to keep benchmark/repos untouched." \
  NOTES="real output on this host: pglite-server (Playwright webServer) cannot bind 127.0.0.1:5432 because a local Docker container already listens there." \
  "$M/next-cap.sh" $R playwright-e2e-port5432-conflict $arm $C/ntb-happy - -- "PORT=5301 npm run test:e2e"
  (cd $C/ntb-happy && cp $M/next-ntb-playwright.config.5332.ts playwright.config.ts)
}
c_vitest() { local arm=$1
  WS=$C/ntb-happy PRE="git checkout -- AGENTS.md" \
  TOOLS="vitest 4.1.10, @vitest/browser-playwright (chromium headless), playwright 1.62.1, next 16.4.0, npm $(npm -v)" BROWSER="Chromium headless shell 1255 (Chrome for Testing 159.0.8154.6) via vitest.config.ts playwright({ launchOptions: { executablePath } })" \
  DEVIATIONS="Previous pass ran this in benchmark/repos/$R; now run in the ntb-happy scratch copy (no task edits) because the browser override must not touch benchmark/repos: vitest.config.ts provider playwright() -> playwright({ launchOptions: { executablePath: <ms-playwright>/chromium_headless_shell-1255/... } }). (ntb-happy's playwright.config.ts port/executablePath edits do not affect vitest.)" \
  "$M/next-cap.sh" $R vitest-happy $arm $C/ntb-happy - -- "npm test"
}
c_valcheck() { local arm=$1
  WS=$C/ntb-val PRE="git checkout -- AGENTS.md" \
  TOOLS="node 24.15.0 native TS type stripping, zod 4.4.3" \
  DEVIATIONS="scratch workspace benchmark/runs/caps/ntb-val (prepareWorkspace with the task edit max(3)->max(1)); cwd = appRoot as in task-kit runChecks; CI unset (runChecks would set CI=1)." \
  NOTES="the check prints nothing; the only signal is the exit code." \
  "$M/next-cap.sh" $R validation-counter-range-check $arm $C/ntb-val $R/validation-counter-range -- "$NV"
}
c_valpw() { local arm=$1
  WS=$C/ntb-val PRE="git checkout -- AGENTS.md" \
  TOOLS="@playwright/test 1.62.1, next 16.4.0 (Turbopack dev via webServer), npm $(npm -v)" BROWSER="$BR" \
  DEVIATIONS="$WSDEV Task edit max(3)->max(1) present. playwright.config.ts webServer pglite port patched to 5333 (host 5432 held by Docker), PORT=5304; $OVR." \
  NOTES="extra capture (not the task's grading command): the repo's own Counter Playwright tests against the injected bug." \
  "$M/next-cap.sh" $R validation-counter-range-playwright $arm $C/ntb-val $R/validation-counter-range -- "PORT=5304 DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5333/postgres npx playwright test tests/integration/Counter.integ.ts tests/e2e/Counter.e2e.ts"
}
# both arms of a case back to back
for c in ${CASES:-e2e conflict vitest valcheck valpw}; do for arm in control agentic-node; do c_$c $arm; done; done
