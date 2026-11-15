# xstack — cross-stack agentic benchmark (baseline vs agentic-react)

The same tasks run on **7 React stacks**, with Jason's **local Claude Code / Codex CLI subscription logins** (no API keys) as the agents. Each task is also checked by an **oracle**: the hidden verifier must fail on the initial state and pass on the reference solution, on every applicable stack.

## Layout

```
stacks/<id>/template/          minimal app per stack; the task's UI is mounted from src/ui/App.tsx
stacks/<id>/stack.json         dev/build/start commands, agentic overlay (adapter, edits, MCP URL)
stacks/<id>/pnpm-lock.<v>.yaml pinned lockfiles (base / agentic)
tasks/<suite>__<id>/           public tasks: task.json, app/ (initial), solution/, tests/{component,e2e}
archive/self-tasks/            retired self-authored tasks (not in any tag set; kept for reference only)
archive/public-tasks/          retired public tasks (web-bench/react-task-1, retired 2026-11-15: Web-Bench considered outdated)
private/tasks/                 ReactBench-derived (upstream has NO LICENSE): internal only, gitignored, never commit/redistribute
verifier/                      isolated @playwright/test install (hidden E2E runner)
harness/                       lib, install-stacks, oracle, run (A/B agent runner), usage, matrix, browser-keeper, mcp-probe
work/                          (gitignored) installed stack variants, per-run workspaces, logs, Playwright browsers
results/                       (gitignored) oracle-*.jsonl, runs.jsonl, matrix.csv
MATRIX.md                      task × stack status (generated)
```

## Stacks

vite-spa (Vite 8), webpack5 (swc-loader + webpack-dev-server), rsbuild (Rspack), next-turbopack (Next 16 default bundler), tanstack-start (Vite SSR), astro (React islands, `client:load`), react-router-7 (framework mode, SSR; the Remix-family meta-framework on top of React). Every stack pins React 19.3.1 and TypeScript 5.9, and uses the same Vitest/RTL/jsdom versions.

Removed on 2026-11-13: **next-webpack** only (duplicates next-turbopack: same framework, only the bundler differs). Its definition is archived under `stacks-archived/next-webpack` (template, stack.json, lockfiles); the installed copy was deleted. To restore: move the dir back to `stacks/`, add its id to `STACK_IDS` in `harness/lib.mjs`, then run `node harness/install-stacks.mjs next-webpack`. react-router-7 was briefly removed the same day and then restored (it is the only Remix-family representative); it was reinstalled from its pinned lockfile with `--ignore-workspace`.

Each stack has a `base` variant. Five stacks also have an `agentic` variant (vite-spa, webpack5, tanstack-start, astro, react-router-7): the `@agentic-react/*@0.3.0` devDependency plus a config edit. rsbuild and next-turbopack have no adapter, so their agentic arm is the same as baseline.

## Commands

```bash
node harness/install-stacks.mjs [ids] [--force]       # isolated pnpm installs (--ignore-workspace), pins lockfiles
node harness/oracle.mjs core10 [--stacks a,b] [--concurrency 4]
node harness/matrix.mjs core10                         # -> MATRIX.md, results/matrix.csv
node harness/run.mjs --task <id> --stack <id> --agent claude|codex --arm baseline|agentic|both \
     [--model sonnet|opus|haiku|<gpt model>] [--effort low|medium|high|xhigh] [--reps N] [--timeout 1800] [--keep] [--dry-run]
```

## How a run works (`harness/run.mjs`)

1. **Materialize.** APFS copy-on-write clone (`cp -c`) of the installed stack variant into `work/runs/<id>/ws`, then copy the task's `app/` into `src/ui/`, then `git init` and a baseline commit.
   - In the agentic variant, the adapter overlay (package.json devDep + config edit) is already in the baseline commit, so it never appears in the agent's diff.
2. **Start the environment.** The dev server starts for **both arms** on a free port. A headless Chromium tab (`browser-keeper.mjs`) stays open on it, because agentic-react's MCP tools are answered by the in-page runtime.
   - Agentic arm only: MCP readiness is probed.
   - `AGENTIC_REACT_BRIDGE_PORT` is passed to every dev server (only the archived next-webpack adapter used it).
3. **Run the agent** on the host, with cwd = workspace. The prompt is the task prompt plus an identical stack-context block (dev URL, log path, pnpm scripts).
   - **Claude:**
     `claude -p … --output-format stream-json --verbose --model M [--effort E] --permission-mode bypassPermissions --strict-mcp-config --mcp-config <file> --setting-sources project --disable-slash-commands --no-session-persistence`
     The MCP config file is empty in the baseline arm.
   - **Codex:**
     `codex exec --json --ephemeral --ignore-user-config --skip-git-repo-check -C ws -m M -c model_reasoning_effort=E --sandbox workspace-write -c sandbox_workspace_write.network_access=true [-c mcp_servers.agentic-react.url=…]`
     The prompt is passed on stdin.
   - **Subscription mode:** `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `OPENAI_API_KEY`, `CODEX_API_KEY` and the Bedrock/Vertex switches are removed from the agent's env, so the CLIs fall back to the logged-in subscription.
4. **Capture usage.** `harness/usage.mjs` parses the CLI's own JSONL stream.
   - **Claude:** `result.usage` gives input, cache_read, cache_creation and output tokens; `num_turns`, `modelUsage` and `duration_ms` come from the result. tool_use / tool_result blocks give tool calls, MCP calls and tool output chars. `total_cost_usd` is stored as `notional_cost_usd`: an API-price equivalent, **not billed** under a subscription. Claude does not split out reasoning tokens; thinking is counted inside output tokens.
   - **Codex:** `turn.completed.usage` gives input (incl. cached), cached and output tokens, plus `reasoning_output_tokens`, which is a subset of output. `item.completed` events give tool calls, MCP calls and tool output chars. Turns ≈ tool rounds + 1, because codex exec emits no per-request event.
   - Wall time is measured by the harness.
5. **Grade (clean room).** `git diff` of the agent's changes is applied onto a fresh **base** materialization, which has no adapter. Then the hidden verifier runs:
   - Vitest + RTL component tests (jsdom; hidden config and aliases)
   - a production build, then the production server, then Playwright E2E
   - for build/type tasks, a fixed strict `tsc` over `src/ui` (no ts-ignore)
   - static regex checks
6. One JSON row is appended to `results/runs.jsonl`. The workspaces are deleted; prompt, transcript, patch and logs are kept in `work/runs/<id>/`.

### Isolation caveats

- Runs happen on the host, not in containers. **Network isolation is not enforced.** Codex additionally runs inside its workspace-write sandbox, with network enabled so it can reach the dev server.
- Every workspace contains `pnpm-workspace.yaml` and `.npmrc` (`ignore-workspace-root-check`), so pnpm, vite and vitest treat it as its own root and never resolve up into the agentic-react repo. Vitest's fs module cache is also disabled in the hidden config. (An earlier run leaked a `.vitest-cache` into the repo root; it was removed.)
- User-level memory is still loaded by both CLIs: `~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md`. Both arms see it equally, but it adds tokens. Hooks, plugins, skills, user MCP servers and user config.toml are excluded.

## Agentic adapter status (measured with `run.mjs --dry-run` + `harness/mcp-probe.mjs`)

| stack | /mcp | runtime in page | get-react-source-code | get-component-tree |
|---|---|---|---|---|
| vite-spa, webpack5 | ✓ | ✓ | ✓ | ✗ (`No React fiber roots found`, or an empty tree on Vite, with React 19.3) |
| tanstack-start, astro, react-router-7 | ✓ | ✗ (`No active runtime bridge connection`): the Vite adapter injects only via `transformIndexHtml`, and SSR frameworks have no index.html | ✗ | ✗ |
| rsbuild, next-turbopack | no adapter | – | – | – |

## Task set (core10) — public benchmark tasks only

Since 2026-11-13 core10 contains **no self-authored tasks**: every task is ported from an established, open-source agent benchmark, with the upstream prompt kept (only a location sentence added/changed) and the upstream verifier specs kept unchanged where possible. Every `task.json` has `source` (repo, path, commit, license), `upstreamPrompt`, `prompt` and `portingNotes`. The 5 earlier self-authored tasks are in `archive/self-tasks/` (not tagged, not run).

| # | task | source benchmark | category | upstream verifier kept |
|---|---|---|---|---|
| 1 | reactbench/openflipbook-72 | ReactBench `tasks/eren23-openflipbook-72`; origin openflipbook PR #72 (MIT, React 19) | UI locate/edit: add empty-state action + async UI state | Vitest (20) + Playwright (2), unchanged |
| 2 | reactbench/coreui-react-460 | ReactBench (millionco) `tasks/coreui-coreui-react-460`; origin coreui-react (MIT) | component state bug | Vitest + Playwright specs |
| 3 | next-evals/agent-024-avoid-redundant-usestate | Next.js agent evals (vercel/next.js `evals/evals/agent-024-…`, MIT) | derived state | ported specs |
| 4 | next-evals/agent-055-stale-build-error | Next.js agent evals (equivalent variant) | build/type error | strict tsc + specs |
| 5 | next-evals/agent-056-status-display | Next.js agent evals | runtime logic bug | ported specs |
| 6 | reactbench/same-recursive-file-drop | ReactBench `tasks/same-recursive-file-drop` (Same, PR #458) | runtime / async failure handling | Vitest (10) + Playwright (2), unchanged |
| 7 | reactbench/yarl-slideshowcontext | ReactBench; origin yet-another-react-lightbox (MIT) | runtime timer/async bug | Vitest (8) + Playwright (12 of 13; 1 latency-dependent test excluded) |
| 8 | reactbench/react-pro-sidebar-267 | ReactBench; origin react-pro-sidebar PR #267 (MIT) | hydration / SSR | Vitest (incl. renderToString SSR spec) + Playwright |
| 9 | terminal-bench/cumulative-layout-shift-lite | Terminal-Bench / frontier-bench `tasks/cumulative-layout-shift` (Apache-2.0, reduced) | perf / CLS | ported specs |
| 10 | reactbench/coreui-react-470 | ReactBench; origin coreui-react PR #470 (MIT) | perf / listener leak | Vitest + CDP `DOMDebugger.getEventListeners` Playwright |

All 10 apply to all 7 stacks (70 combos). ReactBench has **no LICENSE**: its 6 tasks live in gitignored `private/tasks/` for internal evaluation only and must not be committed or redistributed. The React Doctor gate that ReactBench also uses is not ported (behavior-only grading).

Category gaps: no public benchmark task was found that is a clean "runtime crash" (uncaught render error) on a self-contained React app; tasks 5–7 cover runtime logic/async failures instead. Considered and rejected: ReactBench internxt usetrashpagination (its failing signal is only the React Doctor lint gate; behavior tests pass on the initial state), crowdsec/leafwiki/treely/suomifi/lobe-ui (heavy tailwind/radix/chakra/antd/router deps), Terminal-Bench react-lead-form (mostly a Node CLI), most Next.js evals (Next-only APIs), Web-Bench (retired 2026-11-15 as outdated; task-1 archived in `archive/public-tasks/`). Replacement search 2026-11-15: Terminal-Bench/frontier-bench frontend tasks are Node-pipeline (react-lead-form), Next-only (nextjs-performance) or full-stack builds (vba-userform-port); current Next.js evals need Next APIs; tracecat-2879 (ReactBench) is AGPL with radix/react-hook-form/zod deps; so another ReactBench task (openflipbook-72, MIT, zero extra deps) was the strongest portable option.

Oracle: **70/70** combos pass (latest result per pair: `results/oracle-2026-11-13T06-23-26-030Z.jsonl` + yarl re-runs + openflipbook-72 run on 2026-11-15, 7/7). yarl excludes one latency-dependent upstream e2e test (see its portingNotes). On next-turbopack the openflipbook initial state also fails the build (the fixture passes the not-yet-existing props, which Next's build-time tsc rejects); behavior checks fail on all stacks. Harness additions: `e2eSupport` `{from,to}`, `e2eGrepInvert`, Vitest include `{test,spec}`, one server-start retry. `tools/mk-core10-{a,b}.py` are historical.

## Sweep plan (proposal, not run)

First round: only the stacks where the adapter works end to end, **vite-spa and webpack5**. 10 tasks (all applicable on both) × 2 arms × 3 reps = **60 runs per agent/model** (120 for Claude `sonnet` + Codex `gpt-6.1-sol` medium). Add other tiers afterwards.

- tanstack-start, astro and react-router-7 join once the Vite adapter also injects its runtime on SSR frameworks.
- rsbuild and next-turbopack stay baseline-only (no adapter), until adapters exist.
- Note: the 4 smoke runs in `results/runs.jsonl` predate this task set (all 4 used the retired self/ui-dashboard-export-button on vite-spa).

```bash
for s in vite-spa webpack5; do for t in $(node -e "import('./harness/lib.mjs').then(m=>console.log(m.listTasks('core10').map(t=>t.id).join(' ')))"); do
  node harness/run.mjs --task $t --stack $s --agent claude --model sonnet --arm both --reps 3
done; done
```
