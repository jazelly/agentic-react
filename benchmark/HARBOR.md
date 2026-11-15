# Harbor / primase conversion

This directory keeps the original `task.json` harness (`scripts/run.mjs`, `validate-tasks.mjs`) and adds a **Harbor + primase v0.2.0** path that mirrors [agentic-node/benchmark](https://github.com/jazelly/agentic-node).

## Layout

```text
benchmark/
├── tasks/…/task.json              # source of truth (unchanged)
├── harbor-runtime/                # apply-edits.mjs, check-runner.mjs (copied into each Harbor task)
├── vendor/agentic-react-harbor/   # generated Harbor tasks (committed; regenerate with convert)
├── work/variants/agentic-react/   # control + agentic (gitignored; prepare-variants)
├── arms/agentic/<repo>.json       # agentic-react overlay per repo
├── suites.json                    # primase registry
├── experiments/*.yaml             # primase v0.2.0 experiment configs
└── requirements-primase.txt       # pin primase @ fc930e5
```

## Commands

```bash
cd benchmark
node scripts/convert-to-harbor.mjs          # task.json → vendor/agentic-react-harbor/tasks/
node scripts/prepare-variants.mjs           # → work/variants/agentic-react/{control,agentic}/

python3 -m venv .venv && .venv/bin/pip install -r requirements-primase.txt
.venv/bin/primase plan     experiments/cursor-smoke.yaml
.venv/bin/primase validate experiments/cursor-smoke.yaml

# Oracle (Harbor solution agent) — needs Docker; no API keys
.venv/bin/harbor run -a oracle -p work/variants/agentic-react/control/vite-shadcn-admin__runtime-tasks-status-crash -o jobs/oracle-smoke -y

# Local oracle without Harbor (existing harness; needs repos/ clones + install)
node scripts/clone.mjs
node scripts/validate-tasks.mjs --oracle vite-shadcn-admin
node scripts/validate-tasks.mjs --oracle next-webpack-jsoncrack
```

Secrets: only via env or `~/.config/agentic-node/bench.env` (chmod 600). Never commit values. Experiment YAML `env_file` is a **path reference only**.

## Variants

| Variant | Meaning |
|---------|---------|
| `control` | Stock pinned repo + `setup.edits` baseline |
| `agentic` | Same, plus `arms/agentic/<repo>.json` when present (`@agentic-react/*@0.3.0` + config edit + AGENTS snippet folded into baseline) |

### Overlay support

| Repo | Overlay | Notes |
|------|---------|-------|
| `vite-shadcn-admin` | yes | `@agentic-react/vite` |
| `next-webpack-jsoncrack` | yes | `@agentic-react/next` (webpack mode) |
| `tanstack-start-trellaux` | yes | `@agentic-react/vite` |
| `rr7-epic-stack` | yes | `@agentic-react/vite` |
| `webpack-portainer` | **no** | Adapter exists, but CJS webpack entry / Angular hybrid needs a careful wrap — not automated yet |
| `rsbuild-rsdoctor` | **no** | Manifest adapter status `todo` |
| `next-turbopack-boilerplate` | **no** | Adapter hooks webpack only; Turbopack path TODO |
| `astro-web-check` | **no** | Islands / per-root runtime TODO |

Repos without an overlay still get an `agentic/` tree identical to `control` so the harness can cross both arms.

## Grading

Harbor tasks use `verifier.environment_mode = "shared"` and `/tests/check-runner.mjs`, which implements the same step types as `lib/task-kit.mjs#runChecks` (`regex`, `cmd`, `only-changed`, `forbid`, `hidden-test`; optional `browser` skipped unless `BENCH_INCLUDE_OPTIONAL=1`). Per-task grading is unchanged from `check.steps`.

## xstack

**Not converted in this pass.** `xstack/` is a different schema (minimal stack templates × tasks, `app/` + `solution/` trees, Vitest/Playwright clean-room verify, always-on dev server + browser-keeper). Mapping it to Harbor would mean one Harbor task per `(task × stack)` with a different Dockerfile/verifier design. Keep using `xstack/harness/oracle.mjs` until a dedicated converter exists.

## Existing scripts

`clone.mjs`, `validate-tasks.mjs`, `run.mjs`, `summarize.mjs`, and the xstack harness remain the supported local path. Harbor/primase is additive.

## Validation notes (this conversion)

| Check | Result |
|-------|--------|
| `convert-to-harbor.mjs` | **32** Harbor tasks generated |
| `primase plan/validate` cursor-smoke / low / full | OK (384/384 trials planned on full; `CURSOR_API_KEY` expected MISSING) |
| Harbor oracle `control/vite-shadcn-admin__runtime-tasks-status-crash` | **reward 1** |
| Harbor oracle `agentic/vite-shadcn-admin__runtime-tasks-status-crash` | **reward 1** (overlay image) |
| Harbor oracle `control/next-webpack-jsoncrack__ui-bottom-bar-valid-label` | **reward 1** |
| Local `validate-tasks --oracle vite-shadcn-admin` | 3/4 PASS (`state-signout` hidden-test needs browser install) |
| Local `validate-tasks --oracle next-webpack-jsoncrack` | 2/4 PASS on Node 22 (engine ≥24 / `next-env.d.ts` noise); Harbor image uses Node 24 |

No model trials were run. No secrets committed.
