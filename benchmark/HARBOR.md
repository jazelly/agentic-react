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

`only-changed` ignores tooling noise (`next-env.d.ts`, `tsconfig.tsbuildinfo`, build output dirs) so Next auto-rewrites during `@build`/`@typecheck` do not fail the allow-list.

### Node / engines

Each Harbor Dockerfile uses `manifest.harbor.nodeImage` so the image satisfies the pinned repo's `engines.node`:

| Image | Repos |
|-------|-------|
| `node:24-bookworm` | jsoncrack / Next turbopack (`>=24`), Astro (`^24.16` union), vite/tanstack/rsbuild |
| `node:22-bookworm` | `rr7-epic-stack` (`^22.18`), `webpack-portainer` (`^22.22`) |

Local `validate-tasks --oracle` calls `assertHostNodeForRepo` and fails fast when the host Node major is outside that range (e.g. jsoncrack on Node 22).

### Playwright

Tasks whose required checks use Vitest browser mode (or a non-optional `browser` step) install Chromium in the image (`playwright install chromium --with-deps`). Local oracle auto-runs the repo's `test:browser:install` (or `playwright install`) when the cache is empty.

### Harbor post-install

`manifest.harbor.postInstall` (shell commands) runs after package install and before the scratch baseline commit. Local `validate-tasks --oracle` mirrors this via `ensureRepoReady`.

| Repo | Notes |
|------|-------|
| `rr7-epic-stack` | Copy `.env.example` → `.env`, then `prisma migrate deploy` + `prisma generate --sql` (typecheck + vitest) |
| `rsbuild-rsdoctor` | `ignoreInstallScripts` (skip root `prepare` monorepo build), then `pnpm --filter @rsdoctor/client... build` |

Setup edits are applied **after** install/postInstall (and typegen/fonts/playwright) so injected build breaks do not fail the image build; the scratch baseline commit still includes the bug.

## xstack

**Not converted in this pass.** `xstack/` is a different schema (minimal stack templates × tasks, `app/` + `solution/` trees, Vitest/Playwright clean-room verify, always-on dev server + browser-keeper). Mapping it to Harbor would mean one Harbor task per `(task × stack)` with a different Dockerfile/verifier design. Keep using `xstack/harness/oracle.mjs` until a dedicated converter exists.

## Existing scripts

`clone.mjs`, `validate-tasks.mjs`, `run.mjs`, `summarize.mjs`, and the xstack harness remain the supported local path. Harbor/primase is additive.

```bash
# Full Harbor oracle matrix (control × 32 + agentic × 32); needs Docker
node scripts/prepare-variants.mjs
node scripts/run-oracle-batch.mjs --variant both --concurrency 2
```

## Validation notes

See the PR / `experiments/oracle-rewards.csv` for the full 32×2 reward table. Local host artefacts (wrong Node major, missing Playwright browsers before the auto-install landed) are not grading bugs when Harbor reward is 1.

No model trials. No secrets committed.
