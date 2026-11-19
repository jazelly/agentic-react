# Token report: control vs agentic-node vs agentic-react on the benchmark repos

Date: 2026-11-19. Companion to the design doc [`docs/test-compression.md`](../test-compression.md), section 8.

## What was measured

Every case below is a real run on one of the 8 pinned repos in `benchmark/repos/` (pinned SHAs from `benchmark/manifest.json`). Happy paths use each repo's own test suite, build or dev server; failures use the existing tasks' `setup.edits` (applied in scratch workspaces with `benchmark/lib/task-kit.mjs#prepareWorkspace`) and the command from the task's `check.steps`. Browser-console cases open the affected page in headless Chromium and list every `console` message and `pageerror` in order, the way a browser tool shows them.

| Arm | What it is | How the numbers were obtained |
|---|---|---|
| `control` | stock repo | **measured** |
| `agentic-node` | stock repo + agentic-node 0.2.0 (`github:jazelly/agentic-node#4e604d3`) preloaded per its README sandbox template: `NODE_OPTIONS=--require …/agentic-node/src/preload.cjs`, `AGENTIC_NODE_MODE=auto`. Every Node process (dev servers, Vitest, Rstest, webpack, Rsbuild, Next, Astro, Playwright runner) inherits it | **measured** |
| `agentic-react` | the digest this design commits to | **target, hand-specified, not output of any code**: [`runs/scripts/targets.mjs`](runs/scripts/targets.mjs) replaces only the part agentic-react owns in the control capture; all other lines stay as captured |
| `both` | agentic-node + agentic-react | **estimate**: the same replacement applied to the agentic-node capture |

Run conditions, identical for both measured arms:

- Both arms of a case ran back to back on the same workspace state, each after one discarded warm-up run (dep-optimizer caches, Next 16.4's one-time agent prompt); warm-up output is kept under `runs/<repo>/warmup/`.
- Agent markers set (`CLAUDECODE=1 AI_AGENT=claude-code`), because real trials always run under an agent; `CI`, `NO_COLOR`, `FORCE_COLOR` unset; non-TTY; stdin `/dev/null`; stdout+stderr in one file.
- Browser: only the latest. Playwright 1.65.1 with Chrome for Testing 159.0.8154.6 (revision 1255); older browser builds were deleted from the host. Repo suites pinned to older Playwright (rr7 1.58.1, vite-shadcn-admin 1.59.1 via Vitest browser mode, next-turbopack 1.62.1) were pointed at that browser through `launchOptions.executablePath` in the scratch copy; all ran without compatibility errors.
- Tokens: o200k_base (`gpt-tokenizer` 4.1.2) on the raw files, ANSI bytes included.
- Hosts: macOS arm64, Node 24.15.0 (Node 22.22.2 for `rr7-epic-stack` and `webpack-portainer`).

Every capture has a `.meta.txt` (task id, exact command, cwd, env, versions, exit code, duration, warm-up, deviations). agentic-node's own full-output logs are kept in `runs/<repo>/agentic-node-logs/<case>/`. All helper scripts are in [`runs/scripts/`](runs/scripts/). Recompute the tables with `node docs/test-compression/runs/scripts/report.mjs docs/test-compression/runs` (needs `gpt-tokenizer@4.1.2`).

No exit code differed between `control` and `agentic-node` in any case.

## Headline

- **agentic-node alone (measured), 48 cases:** 240,113 → 78,391 tokens (**-67.4%** of the total). Without the single largest case (portainer's 896-error webpack build) it is 98,207 → 72,721 (**-26.0%**). The median case saves only **0.7%**: agentic-node leaves most cases unchanged and wins big on a few long, repetitive Node outputs.
- **Where agentic-node helps:** build/typecheck floods (portainer webpack -96%), Node-side dev-server output (shadcn runtime crash -63%, Astro island dev -40%, rr7 hydration dev -32%), passing test suites with repeated warnings (portainer components -85%), web-server logs inside e2e (rr7 e2e -38.5%).
- **Where it does nothing:** every browser-console case (13 cases, 0%, one regression), and most Next / TanStack / Astro dev output. This is the part the design gives to agentic-react.
- **agentic-react targets (6 cases):** 187,547 → 3,122 tokens (-98.3% of the sum; median case -71.6%) versus agentic-node's 35,450 (-81.1%; median -10.8%) on the same cases. **Both** is estimated at 20,271 (-89.2%; median -68.0%).
- The `both` estimate is worse than agentic-react alone because of one case, rr7 e2e (269 vs 17,812): under the design's current "both" rule, Playwright's `[WebServer]` passthrough belongs to agentic-node's reporter, and agentic-node keeps 636 of the 1,241 web-server lines. See finding 4.

These numbers are tool-output tokens per run, not agent-session totals, so they are not evidence for the 20% target in themselves; they bound what each layer can remove from the outputs an agent reads.

### All cases

| Repo / case | Type | control | agentic-node (measured) | saved | agentic-react (target) | saved | both (estimate) | saved |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| astro-web-check/astro-build-happy | build / typecheck | 1,687 | 1,689 | -0.1% |  |  |  |  |
| astro-web-check/astro-dev-happy | dev server | 427 | 409 | 4.2% |  |  |  |  |
| astro-web-check/dev-yarn-engines-refusal (excluded) | dev server | 160 | 123 | 23.1% |  |  |  |  |
| astro-web-check/island-results-not-hydrated-browser | browser console | 28 | 28 | 0.0% |  |  |  |  |
| astro-web-check/island-results-not-hydrated-dev | dev server | 1,087 | 651 | 40.1% |  |  |  |  |
| astro-web-check/ssr-home-background-window-browser-default | browser console | 56 | 56 | 0.0% |  |  |  |  |
| astro-web-check/ssr-home-background-window-browser | browser console | 28 | 28 | 0.0% |  |  |  |  |
| astro-web-check/ssr-home-background-window-check-boss | build / typecheck | 2,101 | 2,152 | -2.4% |  |  |  |  |
| astro-web-check/ssr-home-background-window-check | build / typecheck | 1,688 | 1,688 | 0.0% |  |  |  |  |
| astro-web-check/ssr-home-background-window-dev-default | dev server | 446 | 428 | 4.0% |  |  |  |  |
| astro-web-check/ssr-home-background-window-dev | dev server | 772 | 754 | 2.3% |  |  |  |  |
| next-turbopack-boilerplate/hydration-locale-switcher-browser | browser console | 1,203 | 1,203 | 0.0% | 374 | 68.9% | 374 | 68.9% |
| next-turbopack-boilerplate/hydration-locale-switcher-dev | dev server | 991 | 1,004 | -1.3% |  |  |  |  |
| next-turbopack-boilerplate/playwright-e2e-port5432-conflict (excluded) | tests failing | 584 | 584 | 0.0% |  |  |  |  |
| next-turbopack-boilerplate/playwright-e2e | tests failing | 1,410 | 1,397 | 0.9% |  |  |  |  |
| next-turbopack-boilerplate/ssr-current-count-crash-browser | browser console | 518 | 518 | 0.0% |  |  |  |  |
| next-turbopack-boilerplate/ssr-current-count-crash-dev | dev server | 525 | 525 | 0.0% |  |  |  |  |
| next-turbopack-boilerplate/validation-counter-range-check (excluded) | tests failing | 0 | 0 | - |  |  |  |  |
| next-turbopack-boilerplate/validation-counter-range-playwright | tests failing | 1,254 | 1,209 | 3.6% |  |  |  |  |
| next-turbopack-boilerplate/vitest-happy | tests passing | 144 | 133 | 7.6% |  |  |  |  |
| next-webpack-jsoncrack/build-webpack-wasm-config | build / typecheck | 1,073 | 1,068 | 0.5% |  |  |  |  |
| next-webpack-jsoncrack/hydration-hero-cta-browser | browser console | 1,657 | 1,657 | 0.0% |  |  |  |  |
| next-webpack-jsoncrack/hydration-hero-cta-dev | dev server | 1,134 | 1,153 | -1.7% |  |  |  |  |
| next-webpack-jsoncrack/runtime-editor-title-crash-browser | browser console | 3,303 | 3,303 | 0.0% |  |  |  |  |
| next-webpack-jsoncrack/runtime-editor-title-crash-dev | dev server | 713 | 713 | 0.0% |  |  |  |  |
| next-webpack-jsoncrack/runtime-editor-title-crash-typecheck | build / typecheck | 246 | 246 | 0.0% |  |  |  |  |
| rr7-epic-stack/a-vitest-happy | tests passing | 4,719 | 4,337 | 8.1% |  |  |  |  |
| rr7-epic-stack/b-double-check-fail | tests failing | 1,090 | 1,003 | 8.0% |  |  |  |  |
| rr7-epic-stack/c-e2e-playwright | tests passing | 40,079 | 24,641 | 38.5% | 269 | 99.3% | 17,812 | 55.6% |
| rr7-epic-stack/d-hydration-browser-console | browser console | 521 | 521 | 0.0% |  |  |  |  |
| rr7-epic-stack/d-hydration-devserver | dev server | 4,768 | 3,244 | 32.0% |  |  |  |  |
| rsbuild-rsdoctor/build-broken-import-browser | browser console | 1,526 | 1,526 | 0.0% |  |  |  |  |
| rsbuild-rsdoctor/build-broken-import-dev | dev server | 772 | 752 | 2.6% |  |  |  |  |
| rsbuild-rsdoctor/build-broken-import | build / typecheck | 1,193 | 1,093 | 8.4% | 795 | 33.4% | 699 | 41.4% |
| rsbuild-rsdoctor/rstest-happy | tests passing | 452 | 432 | 4.4% |  |  |  |  |
| rsbuild-rsdoctor/state-bundle-size-sort-order-check | tests failing | 2,618 | 1,646 | 37.1% |  |  |  |  |
| tanstack-start-trellaux/a-dev-happy-browser-console | browser console | 44 | 44 | 0.0% |  |  |  |  |
| tanstack-start-trellaux/a-dev-happy-devserver | dev server | 106 | 106 | 0.0% |  |  |  |  |
| tanstack-start-trellaux/b-hydration-browser-console | browser console | 715 | 715 | 0.0% | 184 | 74.3% | 184 | 74.3% |
| tanstack-start-trellaux/b-hydration-devserver | dev server | 853 | 853 | 0.0% |  |  |  |  |
| vite-shadcn-admin/a-test-happy | tests passing | 147 | 136 | 7.5% |  |  |  |  |
| vite-shadcn-admin/b-signout-full-suite-fail | tests failing | 571 | 473 | 17.2% |  |  |  |  |
| vite-shadcn-admin/b-signout-hidden-test-fail | tests failing | 507 | 409 | 19.3% |  |  |  |  |
| vite-shadcn-admin/c-tasks-crash-browser-console | browser console | 633 | 633 | 0.0% |  |  |  |  |
| vite-shadcn-admin/c-tasks-crash-devserver | dev server | 830 | 307 | 63.0% |  |  |  |  |
| vite-shadcn-admin/d-bad-import-browser-console | browser console | 219 | 445 | -103.2% |  |  |  |  |
| vite-shadcn-admin/d-bad-import-devserver | dev server | 2,547 | 1,790 | 29.7% |  |  |  |  |
| webpack-portainer/a-components-happy | tests passing | 5,411 | 811 | 85.0% |  |  |  |  |
| webpack-portainer/b-addbutton-hidden-test-fail | tests failing | 2,451 | 2,128 | 13.2% | 1,131 | 53.9% | 808 | 67.0% |
| webpack-portainer/b-expandable-toggle-fail | tests failing | 2,944 | 2,664 | 9.5% |  |  |  |  |
| webpack-portainer/c-alias-build-fail | build / typecheck | 141,906 | 5,670 | 96.0% | 369 | 99.7% | 394 | 99.7% |

Excluded from totals: `next-turbopack-boilerplate/playwright-e2e-port5432-conflict` (host port conflict, not a task scenario); `astro-web-check/dev-yarn-engines-refusal` (host Node version refused by yarn engines, not a task scenario); `next-turbopack-boilerplate/validation-counter-range-check` (empty output (check prints nothing)).

### agentic-node vs control, all included cases (measured)

| Group | Cases | control | agentic-node | saved | saved % (sum) | median per-case saving |
|---|---:|---:|---:|---:|---:|---:|
| **all** | 48 | 240,113 | 78,391 | 161,722 | 67.4% | 0.7% |
| all except portainer webpack build | 47 | 98,207 | 72,721 | 25,486 | 26.0% | 0.5% |
| type: tests passing | 6 | 50,952 | 30,490 | 20,462 | 40.2% | 7.9% |
| type: tests failing | 8 | 12,845 | 10,929 | 1,916 | 14.9% | 11.3% |
| type: build / typecheck | 7 | 149,894 | 13,606 | 136,288 | 90.9% | 0.0% |
| type: dev server | 14 | 15,971 | 12,689 | 3,282 | 20.5% | 2.5% |
| type: browser console | 13 | 10,451 | 10,677 | -226 | -2.2% | 0.0% |
| repo: astro-web-check | 10 | 8,320 | 7,883 | 437 | 5.3% | 0.0% |
| repo: next-turbopack-boilerplate | 7 | 6,045 | 5,989 | 56 | 0.9% | 0.0% |
| repo: next-webpack-jsoncrack | 6 | 8,126 | 8,140 | -14 | -0.2% | 0.0% |
| repo: rr7-epic-stack | 5 | 51,177 | 33,746 | 17,431 | 34.1% | 8.1% |
| repo: rsbuild-rsdoctor | 5 | 6,561 | 5,449 | 1,112 | 16.9% | 4.4% |
| repo: tanstack-start-trellaux | 4 | 1,718 | 1,718 | 0 | 0.0% | 0.0% |
| repo: vite-shadcn-admin | 7 | 5,454 | 4,193 | 1,261 | 23.1% | 17.2% |
| repo: webpack-portainer | 4 | 152,712 | 11,273 | 141,439 | 92.6% | 49.1% |

### The six cases with an agentic-react target

| Arm | control | arm | saved | saved % (sum) | median per-case saving |
|---|---:|---:|---:|---:|---:|
| agentic-node (measured) | 187,547 | 35,450 | 152,097 | 81.1% | 10.8% |
| agentic-react (target) | 187,547 | 3,122 | 184,425 | 98.3% | 71.6% |
| both (estimate) | 187,547 | 20,271 | 167,276 | 89.2% | 68.0% |

## Findings

1. **agentic-node changes app behaviour in one case.** It writes its logs to `<cwd>/.agentic-node/logs/`. In `vite-shadcn-admin/d-bad-import`, a new log file landing inside the Vite root while the import error is active makes the page reload, so the same errors appear twice (browser console 219 → 445 tokens, dev server gets an extra error block). Reproduced twice; with the log directory outside the project (`AGENTIC_NODE_DIR`) there is no reload (`runs/diag/`). **The same risk applies to agentic-react's planned `.agentic-react/logs/`**; the design now puts the log directory where bundler watchers ignore it (design doc section 10).
2. **Line truncation loses failure detail that structure-aware digests keep.** In `rsbuild-rsdoctor/state-bundle-size-sort-order-check`, agentic-node cuts the middle of Rstest's agent-mode report (`… 162 lines omitted …`), which contains the failing cases' errors and diffs; they are only in the full log. For portainer's webpack build it keeps 32 of 896 errors: the root cause is still visible, but the "all 896 come from three alias prefixes, and `resolve.alias` / `resolve.tsconfig` don't cover them" summary needs bundler knowledge (agentic-react target: 369 tokens vs agentic-node 5,670).
3. **agentic-node side effects seen in the output:** deduping React Router's future-flag warnings removes the header lines but leaves their continuation lines (`You can use…`, `-> https://…`) as orphans; in portainer the order of the `RUN` line and the Browserslist notice changes; a `source:` code line is inserted into a non-crash stack; several outputs grow by the `[agentic-node] full output:` line or an added source excerpt (Astro `check-boss` +51, two Next dev cases +13 / +19).
4. **"both" needs a rule for e2e web-server output.** The design's composition rule says the "both" template uses agentic-node's Playwright reporter. On rr7 e2e that keeps 17,812 tokens where agentic-react's standalone reporter target keeps 269. Either agentic-node improves its `[WebServer]` handling in its own work, or the "both" template should keep agentic-react's Playwright reporter for web-server passthrough. Raised as a decision in the design doc (section 13).
5. **Stock tools in agent mode** (all captures run with agent markers): Next 16.4 rewrites `AGENTS.md` and prints a security-upgrade prompt that stops the dev server until restarted (absorbed by the warm-up here); Astro 7.4 backgrounds `astro dev` and serves logs through `astro dev logs` (both parts are in each Astro dev capture); Vitest ≥ 4.1 uses its minimal reporter; Vite 8 forwards the browser console to the terminal.

## Deviations (details in each `.meta.txt`)

- `vite-shadcn-admin` compile-error case: no task breaks compilation, so one ad-hoc broken import in a scratch copy.
- `webpack-portainer` ran in a copy outside the agentic-react monorepo (otherwise `vite-tsconfig-paths` walks up into this workspace and adds ~40 unrelated errors); its install uses `--no-frozen-lockfile` per the manifest (known gap 2 in the design doc).
- `tanstack-start-trellaux` hydration: browser timezone UTC so the mismatch triggers reliably.
- `next-webpack-jsoncrack` hydration: 375px viewport (the bug only shows below 400px).
- `next-turbopack-boilerplate`: dev runs use `npm run dev:next` with a separate pglite on port 5332 (5432 is taken on this host); `CLERK_SECRET_KEY` is the placeholder committed in the repo's `.env`, which Clerk rejects, so one e2e test fails in both arms.
- `astro-web-check`: installed with `yarn --ignore-engines` (host Node 24.15 < `^24.16`); `ssr-home-background-window-check-boss` sets `BOSS_SERVER=true`, without which the task's check passes even with the bug (design doc 8.5).
- Excluded from totals: the three cases listed under the table (host artefacts or empty output).
