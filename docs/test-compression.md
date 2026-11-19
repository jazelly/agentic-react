# Design: front-end test and verification output compression

Status: **design for review. Nothing here is implemented yet.**
Brief (source of truth): [`docs/briefs/test-output-compression.md`](briefs/test-output-compression.md).
Sibling project (independent): `jazelly/agentic-node`, its own `docs/test-compression.md`.

This document answers the brief's process step 1: integration points per test framework and bundler, real before/after output, the boundary with agentic-node, the fairness proposal, how the 20% token target and the success-rate floor are measured, and the risks. Section [13](#13-decisions-requested-in-review) lists the decisions I need from review before implementation starts.

---

## 1. Purpose and positioning

**Goal:** with agentic-react installed, an AI agent developing and testing a React front end spends **at least 20% fewer tokens** on the measured scenarios, with **no noticeable drop in success rate**. If a compression puts accuracy at risk, we print more, not less.

**Positioning:** *the front-end layer for AI agents: browser, DOM, React, and bundler output compressed into exactly what the agent needs, mapped back to source, across every major bundler and framework.*

The existing selection-context feature (component name, selector, source file, owner trace) stays as is. This work reuses its component-location machinery and does not extend it. The README's -53.6% study measures that old feature and is not evidence for output compression.

## 2. Design principles

1. **Fix the output where it is produced, not where it is printed.** agentic-react changes what goes *into* the output: the text of a testing-library error, the failure message of a Playwright or Cypress test, the browser console, the bundler's error report. It does not take over the test runner's reporter when another layer (agentic-node, the project's own reporter) owns it. This is what lets agentic-react and agentic-node compose without knowing about each other (see [section 9](#9-boundary-with-agentic-node)).
2. **Lossless.** Every integration writes the full raw output to `.agentic-react/logs/<MMDD-HHMMSS>-<pid>.log` and ends its digest with `[agentic-react] full output: <path>`. Traces, videos, screenshots and HTML reports are never deleted; the digest prints their paths.
3. **Safe.** Never hide a failure, never change an exit code, never change test results. If a parser does not recognise the output, pass it through unchanged and still print the log path.
4. **When unsure, keep more.** A DOM excerpt that might not contain the root cause is widened, not cut. Mapping failures drop the annotation, never the output.
5. **Explicit install, one switch.** Users add the config template for their bundler and test framework. Once installed, compact output is the default. `AGENTIC_REACT_OUT=raw` restores stock output for that run (the benchmark already sets this variable). No auto-detection of agents, CI, or agentic-node.
6. **Plain text.** Digests are plain text with no ANSI codes when stdout is not a TTY, so any other layer can still read and re-compress them.

## 3. What reaches the agent today

The agent sees four kinds of front-end output. Each needs a different integration point:

| Output | Produced by | Printed by | agentic-react hook |
|---|---|---|---|
| Testing-library errors (`Unable to find…` + DOM dump) | `@testing-library/dom` | test runner (Vitest, Jest) | `configure({ getElementError })` |
| e2e failures (locator, step, DOM at failure) | Playwright / Cypress | their reporters | Playwright fixture, Cypress support file |
| Browser console (React warnings, hydration, page errors) | the page | invisible unless a test or browser tool collects it | injected runtime patches `console.error` in the page |
| Dev-server / build output (compile errors, HMR, overlay) | the bundler | the bundler CLI / dev server | bundler plugin (existing adapters) |

## 4. Package layout

Fewest new packages that cover the targets:

| Package | Status | Contents |
|---|---|---|
| `@agentic-react/core` | exists | add `digest/`: raw-log writer, DOM excerpt builder, React warning parser and deduper, source annotator (reuses `bippy` fiber walk, owner stacks, and `findComponentSourceInProject`) |
| `@agentic-react/test` | **new** | one package, subpath exports per framework: `/playwright`, `/cypress`, `/testing-library`, `/vitest-browser`. Framework packages are optional peer dependencies |
| `@agentic-react/vite` | exists | add dev-server and build output compression; used as-is by TanStack Start and React Router v7 |
| `@agentic-react/webpack` | exists | add compile-error compression |
| `@agentic-react/next` | exists | add compile-error compression for webpack mode; add Turbopack path |
| `@agentic-react/rsbuild` | **new** | Rsbuild plugin (also covers plain Rspack through its webpack-compatible plugin API) |
| `@agentic-react/astro` | **new** | Astro integration wrapping the Vite plugin plus per-island runtime |

One `test` package instead of four keeps one version, one README section and one changeset, at the cost of optional peer dependencies.

## 5. Test framework integration

Order (from the brief): Playwright and Cypress first, then Vitest browser mode and React Testing Library. React warnings are cross-cutting and land with whichever framework ships first.

### 5.1 Playwright (`@agentic-react/test/playwright`)

Two pieces, usable separately:

- **Fixture** (`export { test, expect } from '@agentic-react/test/playwright'`, or `test.extend(agenticReactFixtures)` for projects with their own fixtures). Per test it:
  - installs a minimal React DevTools hook with `page.addInitScript` so fiber data is available even when the app has no agentic-react bundler adapter (dev builds only; production builds have no debug info, so annotation is skipped);
  - collects `console` messages of type `error`/`warning` and `pageerror` events, dedupes React warnings (5.5), and maps them to component + file:line;
  - on failure, appends to the **test's error message** a compact block: the failing locator, a DOM excerpt around the locator's closest match (5.3), the deduped console errors, and the paths of trace / video / screenshot attachments.
  Because it enriches the error itself, the block shows up under any reporter: stock `list`, `line`, the project's own, or agentic-node's.
- **Reporter** (`reporter: [['@agentic-react/test/playwright/reporter']]`) for standalone use. Happy path: one line per project with pass/skip/flaky counts and duration, React warning summary, HTML report path. Failure: per failing test, title, `file:line`, the (already enriched) error, attachment paths. Raw output: the reporter runs Playwright's built-in `list` reporter into the raw log, so nothing is lost.

When agentic-node is also installed, the README template for "both" uses agentic-node's Playwright reporter plus agentic-react's fixture. Nothing detects anything at runtime; the template just picks one reporter.

### 5.2 Cypress (`@agentic-react/test/cypress`)

- **Support file** (`import '@agentic-react/test/cypress/support'` in `cypress/support/e2e.ts`):
  - `Cypress.on('window:before:load')` installs the DevTools hook and wraps the window's `console.error`/`console.warn` to collect React warnings;
  - `Cypress.on('fail', (err, runnable) => …)` appends the same compact block as Playwright (subject/selector, DOM excerpt, console errors) to `err.message`, then rethrows.
- **Plugin** (`setupNodeEvents(on, config) { agenticReact(on, config) }`): replaces the stock `spec` reporter output with a digest (counts per spec, failures with enriched messages, screenshot/video paths) and writes the stock output to the raw log. It hooks `after:spec`/`after:run` and Cypress's `reporter` option (mocha reporter API), never the exit code.

Cypress stock output carries a large ASCII run table and per-spec headers on every run; that is where most of the happy-path savings come from.

### 5.3 React Testing Library (`@agentic-react/test/testing-library`)

One setup file for Vitest (`setupFiles`) or Jest (`setupFilesAfterEach`):

- `configure({ getElementError })` replaces the default "Unable to find … + whole `document.body` dump" with:
  - the query that failed (`role="button" name="Save"`);
  - a **DOM excerpt** around the best candidate: the closest accessible elements by role, then label/text similarity, with their nearest component ancestor and source location;
  - a short candidate list (other elements with the same role, or with matching text under another role).
  The excerpt keeps the candidate's ancestors up to the nearest landmark/form and its siblings, collapses unrelated subtrees to `<… 12 nodes>`, and strips class-name noise. If no candidate scores above a threshold, it falls back to a larger excerpt (whole nearest landmark), never to nothing. The digest never contains ANSI codes, and the raw log gets the uncoloured full dump.
- imports `bippy` before React so fiber data is available in jsdom / happy-dom;
- patches `console.error`/`console.warn` to dedupe React warnings (5.5).

`getElementError` is the official extension point and its output flows through any runner and reporter unchanged, so it composes with agentic-node and with Vitest's agent reporter.

### 5.4 Vitest browser mode (`@agentic-react/test/vitest-browser`)

Vitest browser mode runs tests in a real browser; `vitest-browser-react` locators come from `@vitest/browser`, not from `@testing-library/dom`, so `getElementError` does not apply. Integration:

- a browser-side setup file (`test.browser` `setupFiles`) that installs the DevTools hook, wraps `console.error`, and enriches failed `expect.element(...)` assertions and locator timeouts with the same DOM excerpt + candidates block;
- the Node side of Vitest (reporter, counts, diffs) is generic and left to agentic-node or to Vitest's own reporters.

The exact hook for rewriting browser-mode locator errors needs a spike against the installed Vitest major (see risks).

### 5.5 React warnings (all frameworks)

Recognised families: missing `key`, `act(...)`, hydration mismatch (React 18 text/attribute messages and React 19's single "hydrated but some attributes / text didn't match" message with its diff), deprecations (`defaultProps`, `findDOMNode`, string refs, legacy context). For each family:

- dedupe by (family, component, location) and print once with a count: `React key x14: <TaskRow> src/routes/tasks/row.tsx:18`;
- keep the first full message in the raw log;
- for hydration mismatches keep the server/client values from React's diff and the component path (`<LastUpdated> … via <Header> …`);
- unknown `console.error` text passes through unchanged (deduped only when byte-identical, with a count).

Where the dedupe happens: in Playwright and Cypress, in the fixture / support file, summarised by the reporter for the whole run. In Vitest and Jest, test files run in isolated module scopes, so the setup file dedupes per test file and prints one summary line per file from `afterAll`. It does not try to dedupe across files; that would need shared state for little gain. Under Vitest's agent reporter, console output of passing files is dropped, including this summary; failing files keep it.

## 6. Bundler integration

### 6.1 Order and definition of "supported"

A bundler/framework target is **supported** when all of these hold, verified on its benchmark repo:

1. the adapter installs from the README template on that repo, and the oracle passes in the `agentic-react` and `both` arms;
2. compile / build errors are digested (error message, `file:line:col`, code frame), with the raw log path;
3. browser runtime errors and React warnings are captured in the page and mapped to component + source (dev mode);
4. a fixture for that bundler asserts the preserved fields (5.x, 11.3).

Order, by user reach and by how much is already in place:

| # | Target | Benchmark repo | Today | Work |
|---|---|---|---|---|
| 1 | Vite | `vite-shadcn-admin` | adapter + overlay | output compression |
| 2 | Next, webpack mode | `next-webpack-jsoncrack` | adapter + overlay | output compression |
| 3 | Next, Turbopack | `next-turbopack-boilerplate` | no overlay | new path (6.4) |
| 4 | webpack | `webpack-portainer` | adapter, no overlay | output compression + overlay for the CJS entry |
| 5 | TanStack Start | `tanstack-start-trellaux` | Vite adapter + overlay | verify against 6.1 |
| 6 | React Router v7 | `rr7-epic-stack` | Vite adapter + overlay | verify against 6.1 |
| 7 | Rsbuild / Rspack | `rsbuild-rsdoctor` | none | new `@agentic-react/rsbuild` |
| 8 | Astro islands | `astro-web-check` | none | new `@agentic-react/astro` |

### 6.2 Vite (also TanStack Start, React Router v7)

- **Dev server:** the plugin's `config` hook supplies a `customLogger` that keeps Vite's normal lines but digests errors: transform/import-analysis errors become `vite: <message> at <file:line:col>` + a code frame trimmed to 3 lines + the importer chain, repeated identical errors on every HMR update print once with a count. Startup banner and HMR update lines are left to the generic layer (agentic-node) and are untouched here.
- **Build:** `buildEnd` / `closeBundle` errors get the same digest; the Rollup/Rolldown plugin-stack noise goes to the raw log.
- **Repeated errors:** identical error blocks (same message, file, position) print once, followed by one `same error repeated: … xN` line when the burst ends.
- **Browser:** Vite 8 already forwards the browser console to the terminal when it detects an agent (`forwardConsole`), so React warnings arrive there as repeated multi-line `[console.error]` entries. The logger dedupes those and annotates them with component + source from the page runtime. On Vite majors without `forwardConsole`, or when it is off, the existing client runtime forwards deduped errors and React warnings over the existing bridge instead. Either way the agent reads them in the dev-server output it already has, without opening a browser tool just for the console.
- To verify in the spike: that `customLogger` set from a plugin `config` hook is honoured by the installed Vite majors (6, 7, 8), and how `forwardConsole` lines reach the logger.

### 6.3 webpack and Next (webpack mode)

- A webpack plugin taps `compiler.hooks.done` and prints a digest of `stats.compilation.errors`/`warnings`: module path → `file:line:col`, loader name, message, trimmed code frame, deduped `ModuleNotFoundError` chains. Large error sets are grouped: `Module not found` errors are grouped by the unresolved specifier's prefix, and when every unresolved specifier uses a path alias the digest says which of those prefixes `resolve.alias` / `resolve.tsconfig` do not cover (the portainer case in 8.4: 896 errors, three prefixes). The stock stats output goes to the raw log. How to suppress the stock printing without changing `stats` semantics for other plugins (CLI vs `webpack-dev-server` vs Next's own printer) is verified per host in the spike.
- Next webpack mode reuses this inside `withAgenticReactNext`'s `webpack()` hook; Next prints its own compile errors, so for Next the digest replaces Next's error block only when we can intercept it cleanly, otherwise it is skipped (no double printing).
- `webpack-portainer` overlay: wrap the CJS `webpack/webpack.common.js` export with the adapter's CJS entry and leave the AngularJS entry untouched (fixes known gap 1 for this repo).

### 6.4 Next with Turbopack

Turbopack does not run webpack plugins, so the current adapter has no effect. Path:

- client runtime injection through `instrumentation-client.ts` (Next ≥ 15.3) instead of a webpack entry;
- the bridge server and MCP start from `instrumentation.ts` `register()` in dev on their own port, since there is no dev-server middleware hook;
- compile errors: Turbopack prints them itself; we digest what reaches the browser overlay / `__nextjs_original-stack-frames` and leave the terminal untouched in V1;
- source mapping uses Next's original-stack-frames endpoint, which the core already calls;
- Next 16.4's own agent mode (appends to `AGENTS.md`, prints a security-upgrade prompt and stalls the first request; see 8.3) is not something agentic-react changes or depends on. The README template documents it, and the benchmark handles it in the arm definition (11.1).

### 6.5 Rsbuild / Rspack

`@agentic-react/rsbuild` is an Rsbuild plugin: `modifyRsbuildConfig` injects the client entry, `dev.setupMiddlewares` mounts the bridge and MCP, `onDevCompileDone` / `onAfterBuild` digest Rspack stats errors with the same formatter as webpack (Rspack's stats are webpack-compatible). Plain Rspack users use `@agentic-react/webpack`, which only uses webpack-compatible APIs.

### 6.6 Astro islands

`@agentic-react/astro` is an Astro integration: `astro:config:setup` adds the Vite plugin through `updateConfig` and injects the client runtime with `injectScript('page', …)`. Each React island is its own React root; the runtime tracks all roots so annotation works per island. Compile errors come from Vite and reuse 6.2. Astro 7.4 runs `astro dev` in the background when it detects an agent and serves its log as JSON lines through `astro dev logs` (8.3); the integration digests through Astro's integration logger so both the foreground terminal and `astro dev logs` get the compact form, and JSON lines stay valid JSON.

## 7. Source and component mapping

Reuses the selection-context machinery; nothing new is invented here:

1. DOM node → nearest fiber via `bippy` (`getFiberFromHostInstance`) → nearest user component name.
2. Source location, best first:
   - React 19 owner stacks (`_debugStack`), parsed and symbolicated through the bundler's sourcemaps (Next: original-stack-frames endpoint, as today; Vite/Vitest: stacks are already source-mapped in Node; browser: the dev server's sourcemaps);
   - React ≤ 18 `_debugSource` (portainer is React 17);
   - fallback: `findComponentSourceInProject` (declaration grep). Its line is the component's declaration, so it is printed as `src/x.tsx:12 (component)`, not as the exact JSX line.
3. Errors and warnings: component stacks in React warnings are mapped the same way; frames inside `node_modules` are kept only as `(via react-dom)`, project frames are kept in full.
4. Any failure → no annotation. The original text is never dropped.

## 8. Before/after output

### 8.1 How these were produced

- **Before = real output from the benchmark repos.** All captures come from the 8 pinned repos in `benchmark/repos/`, at their pinned SHAs. Happy paths use each repo's own test suite or dev server. Failures use the existing tasks' `setup.edits`, applied in a scratch workspace with `lib/task-kit.mjs#prepareWorkspace`, and run with the command from the task's `check.steps`. Browser-console captures open the affected page in headless Chromium and list every `console` message and `pageerror` in order, the way a browser tool shows them. Commands ran non-TTY with `CI`, `NO_COLOR` and `FORCE_COLOR` unset and all AI-agent env markers removed. Files ending in `.agent.txt` repeat the run with `CLAUDECODE=1 AI_AGENT=claude-code`, and exist only where the output differed.
- Every capture is committed unmodified under [`docs/test-compression/before/<repo>/`](test-compression/before/). Each one has a `.meta.txt` with the task id, exact command, cwd, versions, env, exit code and any deviation, and each repo has a `TOKENS.md`. Deviations worth knowing: `vite-shadcn-admin` has no task that breaks compilation, so its compile-error case is one ad-hoc broken import (marked in its meta); `webpack-portainer` ran in a copy outside the agentic-react monorepo, because `vite-tsconfig-paths` otherwise walks up into this repo's workspace and adds ~40 unrelated error lines; the TanStack Start hydration case uses a UTC browser timezone so the mismatch triggers reliably; `next-turbopack-boilerplate` dev runs used another pglite port because 5432 was taken on the host.
- **After = hand-written target, not output of any code.** Nothing is implemented. Each file in [`docs/test-compression/after/<repo>/`](test-compression/after/) is the digest this design commits to produce for that same capture, written by hand from it. Where agentic-react replaces only part of the output, the target splices the replacement into the real capture, so the runner's own lines stay exactly as captured.
- **Tokens:** o200k_base via `gpt-tokenizer` 4.1.2, on the raw files (ANSI bytes included), recomputed by [`docs/test-compression/compare.mjs`](test-compression/compare.mjs).

These numbers are **targets the fixtures (11.3) must meet**, not measurements of agentic-react, and not evidence for the 20% goal: tool output is only part of an agent's total tokens.

### 8.2 Targets for six benchmark cases

| Repo / case | Task | Before (real) | After (target) | Change | Who owns the saving |
|---|---|---:|---:|---:|---|
| `webpack-portainer` webpack build | `build-webpack-alias-resolution` | 143,119 | 554 | -99.6% | agentic-react (bundler errors) |
| `rr7-epic-stack` Playwright e2e, 26 passing | (repo suite) | 40,258 | 247 | -99.4% | split, see below |
| `next-turbopack-boilerplate` hydration, browser console | `hydration-locale-switcher` | 1,218 | 368 | -69.8% | agentic-react (React warning) |
| `tanstack-start-trellaux` hydration, browser console | `hydration-home-updated-at` | 695 | 153 | -78.0% | agentic-react (React warning) |
| `rsbuild-rsdoctor` Rsbuild build | `build-broken-import` | 1,190 | 648 | -45.5% | agentic-react (bundler errors) |
| `webpack-portainer` RTL hidden test | `ui-add-button-default-label` | 3,608 | 2,287 | -36.6% | agentic-react (DOM dump); rest is generic |

How to read the last two columns:

- **rr7 e2e:** of the 40,258 tokens, 31,930 are the app's own web server log that Playwright passes through as `[WebServer]` lines (1,234 lines of request logs and mock emails), 7,671 are the `pretest` production build (Vite asset table, the same 5 React Router future-flag warnings printed 4 times), and 656 are Playwright itself. The build digest is agentic-react's (Vite / framework output). Routing `[WebServer]` lines to the log is runner-level: agentic-react's standalone Playwright reporter does it, and in the "both" setup agentic-node's reporter does instead.
- **portainer RTL:** agentic-react removes the two identical DOM dumps (the `findByText` retry prints the same body twice). The remaining 2,287 tokens are generic runner output (7 `punycode` deprecation warnings, one per worker, a Browserslist notice, Vitest's own lines), which is agentic-node's domain. The saving with both installed would be larger; this table only counts what agentic-react itself would remove.
- **Rsbuild** already prints compact, well-formatted errors. The saving comes from merging one bad import that is reported three times (one TS2724 and two `ESModulesLinkingError` with transpiled code frames) into one root cause.

### 8.3 What the captures changed in the design

1. **Bundler error floods are the largest single cost.** One removed `resolve.tsconfig` line in portainer gives 896 `Module not found` errors (143k tokens). All 896 share three alias prefixes, so the digest groups by unresolved specifier prefix and checks the resolver config (6.3).
2. **Agent detection in stock tools changes the control arm.** With `CLAUDECODE`/`AI_AGENT` set:
   - Vitest ≥ 4.1 switches to its agent (minimal) reporter (`vite-shadcn-admin` happy path 2,314 → 145 tokens). Vitest 4.0 (`rr7-epic-stack`) has no such reporter.
   - Vite 8 forwards the browser console into the dev-server terminal, which makes dev output longer (TanStack hydration dev server 108 → 853 tokens).
   - **Next 16.4** appends a `nextjs-agent-rules` block to `AGENTS.md`, and on the first request prints a security-upgrade prompt addressed to the agent and stops responding (`ERR_EMPTY_RESPONSE`) until restarted, hiding the real SSR/hydration error. Next 16.3 (`jsoncrack`) only writes `AGENTS.md`/`CLAUDE.md`.
   - **Astro 7.4** backgrounds `astro dev`: it prints one JSON line and exits 0; logs are read with `astro dev logs` as JSON lines.
   - **Rstest** agent output is shorter on success but longer on failure (1,838 → 2,619 tokens).
   These are fixed in the arm definition (11.1) and handled per integration (6.4, 6.6).
3. **ANSI codes reach agents in non-TTY runs.** Vitest 4 colours output whenever `TERM` is not `dumb`, without checking for a TTY, and testing-library colours its DOM dumps. agentic-react's own blocks never emit ANSI.
4. **Browser console noise around the real error.** The hydration captures carry dev-tool banners, repeated `ERR_CONNECTION_REFUSED` lines and unrelated image warnings; the digest keeps them but dedupes byte-identical repeats (5.5).

### 8.4 Examples

Long absolute workspace paths are shortened to `<ws>` here; the committed files are unmodified. `[… N lines]` marks lines left out of this page only.

**webpack-portainer, `build-webpack-alias-resolution`.** Before (real, 5,187 lines):

```text
> @portainer/ce@2.45.3 build <ws>
> webpack

Failed to load ./.env.
Browserslist: browsers data (caniuse-lite) is 6 months old. Please run:
[… 6 lines: Browserslist notice, babel-plugin-lodash deprecation trace]
assets by info 24.5 MiB [immutable]
[… 33 lines of asset and module summary]

ERROR in ./app/azure/index.ts 30:0-65
Module not found: Error: Can't resolve '@/portainer/services/notifications' in '<ws>/app/azure'
 @ ./app/index.js 8:0-38 37:277-288

ERROR in ./app/azure/react/views/index.ts 3:0-50
Module not found: Error: Can't resolve '@/react-tools/react2angular' in '<ws>/app/azure/react/views'
 @ ./app/azure/react/index.ts 4:0-38 5:66-77
 @ ./app/azure/index.ts 31:0-38 32:60-71
 @ ./app/index.js 8:0-38 37:277-288
[… 894 more ERROR blocks, ~5,100 lines]

896 errors have detailed information that is not shown.
Use 'stats.errorDetails: true' resp. '--stats-error-details' to show it.

webpack 5.107.2 compiled with 896 errors in 6678 ms
```

After (target; the lines before the stats block are kept as captured):

```text
webpack 5.107.2 compiled with 896 errors in 6678 ms
ERROR Module not found x896; every unresolved specifier uses a path alias:
  '@/...'   x844  top: @/react-tools/react2angular x50, @/react-tools/withUIRouter x41, @/react-tools/withCurrentUser x36
  '@@/...'  x51   top: @@/modals/confirm x18
  '@api/...' x1   @api/sdk.gen
  webpack resolve: alias has no '@', '@@' or '@api' entry; resolve.tsconfig is not set
  first: app/azure/index.ts:30 imports '@/portainer/services/notifications' (via app/index.js:8)
  asset/module summary and all 896 errors with import chains: see log
[agentic-react] full output: .agentic-react/logs/1119-183005-67201.log
```

**webpack-portainer, `ui-add-button-default-label` hidden test (React 17, RTL).** Before (real; the error body, printed twice):

```text
TestingLibraryElementError: Unable to find an element with the text: Create. This could be because the text is broken up by multiple elements. [...]

Ignored nodes: comments, <script />, <style />
<body>
  <div>
    <div>
      Root
    </div>
    <div />
    <a
      class="btn btn-primary btn-sm !m-0"
      data-cy="bench-add-button"
      type="button"
    >
      <svg
        aria-hidden="true"
[… 20 lines of svg attributes and paths]
      Add
    </a>
  </div>
</body>

Ignored nodes: comments, <script />, <style />
<body>
[… the same 38 lines again]
</body>
```

After (target):

```text
TestingLibraryElementError: Unable to find text "Create"
  closest text: "Add" in <a data-cy="bench-add-button"> <AddButton> app/react/components/buttons/AddButton.tsx:26 (via <Button>, <Link>)
    <div>Root</div>
    <a class="btn btn-primary btn-sm" data-cy="bench-add-button">
      <svg lucide-plus />
      Add            <- closest
    </a>
  (findByText retried for 1000ms; same DOM on every retry. Full DOM in log)
  [agentic-react] full output: .agentic-react/logs/1119-183005-67201.log
```

**tanstack-start-trellaux, `hydration-home-updated-at`, browser console.** Before (real):

```text
[pageerror] Error: Hydration failed because the server rendered text didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:
[… 9 lines of generic causes and a link]
  ...
    <div className="grow min-h...">
      <OutletImpl>
        <Suspense fallback={null}>
          <MatchImpl routeId="/">
            [… 4 lines of router internals]
                    <Home>
                      <div className="p-8 space-y-2">
                        <h1 className="text-2xl f...">
                          <span className="text-xs te...">
+                           8:03:08 AM
-                           6:33:08 PM
                        ...
    at throwOnHydrationMismatch (http://localhost:5211/node_modules/.vite/deps/react-dom_client.js?v=d68d78cf:3121:51)
    [… 9 more react-dom frames]
```

After (target):

```text
[pageerror] Hydration failed (text mismatch): server "6:33:08 PM" vs client "8:03:08 AM"
  at <span> in <Home> src/routes/index.tsx:18
  via <MatchInnerImpl routeId="/"> < <OutletImpl> (TanStack Router)
  common causes: Date/locale formatting, Date.now()/Math.random(), typeof window branches. https://react.dev/link/hydration-mismatch
  (react-dom frames x10 and full message in log)
```

**rr7-epic-stack, Playwright e2e, 26 passing.** Before (real, 1,593 lines): `npm run build` output with 20 future-flag warnings and a 90-line asset table, then 1,234 `[WebServer]` lines interleaved with Playwright's dot reporter, ending in `26 passed (21.4s)`. After (target):

```text
> pretest:e2e:run
> npm run build

> build
> react-router build

React Router: Future Flag Warning x5 kinds, each printed 4x: v8_middleware, v8_splitRouteModules, v8_viteEnvironmentApi, v8_passThroughRequests, v8_trailingSlashAwareDataRequests (https://reactrouter.com/upgrading/future-flags)
vite v7.3.1 client build ok: 991 modules, 15 empty chunks, 1 sourcemap warning (react-router dom-export.mjs); ssr build ok: 138 modules
  warning: source maps are enabled in production
(node:82850) ExperimentalWarning: SQLite is an experimental feature and might change at any time
playwright: 26 passed (chromium, 1 worker) in 21.4s
  web server: 1234 lines (request log, mock emails), no errors; 4 responses 404: /does-not-exist x2, /img/missing.png, /favicons/missing.png
[agentic-react] full output: .agentic-react/logs/1119-183005-67201.log
```

The Rsbuild and Next Turbopack targets are in [`docs/test-compression/after/`](test-compression/after/) next to their captures.

### 8.5 Coverage gaps in the captures

- **Cypress:** none of the 8 repos uses Cypress, so there is no benchmark output for it (decision 5 in section 13).
- **Three tasks whose checks do not behave as written** (found while capturing; to fix in the benchmark step):
  - `astro-web-check/ssr-home-background-window`: with the bug injected, `npx astro build` still exits 0, because without `BOSS_SERVER=true` the home page redirects to `/check` and `index.astro` never renders. With `BOSS_SERVER=true` it fails with "Unable to render HomeBackground!".
  - `rsbuild-rsdoctor/state-bundle-size-sort-order`: the `-- module-tree-sort` filter in its check command has no effect; all 17 test files run.
  - `next-turbopack-boilerplate/validation-counter-range`: its check prints nothing and exits 1; the repo's own Counter Playwright test was captured instead to show the failure.

## 9. Boundary with agentic-node

| Concern | Owner |
|---|---|
| pass/fail counts, assertion diffs, stack cleanup, incremental reruns, generic dev-server/build log noise, any Node test runner | agentic-node |
| DOM dumps and DOM at failure time, locators, browser console / page errors, React warnings, component + source mapping, bundler compile errors and sourcemaps, dev-server HMR/overlay errors | agentic-react |

Rules that keep the two independent:

- no dependency in either direction, no runtime detection, no shared state, separate log directories (`.agentic-react/` vs `.agentic-node/`);
- agentic-react rewrites **content at the producer** (testing-library error text, Playwright/Cypress failure messages, page console, bundler error reports). agentic-node rewrites **runner output** (reporters, stdout). When both are installed, agentic-node sees already-compact text and compresses it further as plain text; neither rewrites the other's lines;
- agentic-react's standalone pieces that overlap with runner-level output (the Playwright reporter, the Cypress digest reporter) are opt-in through the README template. The "both" template uses agentic-node's reporters and only agentic-react's producer-side pieces;
- the generic handling agentic-react needs to stand alone is limited to those two standalone reporters: counts, durations, failure list. No diffs, no stack rewriting beyond dropping `node_modules` frames inside front-end messages.

## 10. Lossless raw output

One log per process under `.agentic-react/logs/`, named `<MMDD-HHMMSS>-<pid>.log`. It contains the stock output the integration replaced (stock reporter output, full testing-library DOM dumps, full console messages, full stats). The digest always ends with the path. Templates add `.agentic-react/` to `.gitignore`. The directory is safe to delete. V1 has no rotation; it is a dev directory.

## 11. Benchmark methodology

### 11.1 Arms

| Arm | Setup |
|---|---|
| `control` | stock pinned repo + setup edits, `AGENTIC_REACT_OUT=raw` |
| `agentic-node` | control + agentic-node installed per its README template (installed from its git URL; the agentic-node repo is not modified) |
| `agentic-react` | control + agentic-react installed per this repo's README template for that bundler and test framework |
| `both` | control + both templates ("both" variant of the templates) |
| `vitest-agent` (comparison, Vitest tasks only) | control with Vitest's own agent reporter selected |

**Agent env markers are part of the arm definition.** Vitest switches to its agent reporter and Vite 8 turns on `forwardConsole` when they see `CLAUDECODE`, `AI_AGENT`, `CURSOR_AGENT` and similar variables. So the stock behaviour of `control` depends on which agent runs it. Next 16.4, Astro 7.4 and Rstest also change behaviour on these markers (8.3); Next 16.4 even stalls its first dev request with an upgrade prompt. The harness sets the same markers in every arm (whatever the agent under test sets naturally), records them and the Vitest reporter actually selected in each result, and the `vitest-agent` arm forces `--reporter=agent` so that comparison does not depend on detection. Base images run `next dev` once during the build so the one-time Next prompt is not paid inside a trial, and that warm-up is recorded.

Every arm gets the same `AGENTS.md`/prompt, except that the `agentic-react` and `both` arms keep the short snippet (its tokens are counted). The current snippet (`benchmark/arms/agentic/AGENTS.snippet.md`) says "Long command output is compacted", which is not true until this work ships; it must stay out of runs until then.

### 11.2 Fairness: browser tools

**Proposal: every arm, control included, gets the same browser tool: `playwright-cli`.** Reasoning:

- Users this project targets (people building sites with AI) run with a browser in the loop. A control with no way to see the page understates real token cost and makes scenario 2 and 3 tasks fail or loop for reasons that have nothing to do with output compression, which inflates any gain.
- The measured question is "does agentic-react make the same loop cheaper", so both arms must have the same loop.
- `playwright-cli` over chrome-devtools-mcp: its output arrives as plain shell output, so it is counted by `tool_output_chars` the same way for every agent, and it needs no per-agent MCP configuration. agentic-react's console wrapper in the page also shortens what `playwright-cli` prints (console messages are produced by the page), so the gain stays measurable through it.
- The existing agentic-react MCP stays in the `agentic-react` and `both` arms only, as today; its tool descriptions are part of that arm's paid context.

### 11.3 Fixtures (deterministic, no model)

Under `benchmark/fixtures/<repo>/<case>/`. Every fixture is a case on one of the 8 pinned benchmark repos, not a synthetic app: repo id, an optional task id whose `setup.edits` are applied, the command, and a list of facts that must survive compression. The cases in section 8 are the starting set. A runner executes each case twice (`AGENTIC_REACT_OUT=raw` and compact) and checks:

- o200k token count raw vs compressed (reported, per case);
- every preserved fact appears in the digest: failing test title, failing step, locator / query, component name, `file:line`, error message, server vs client values for hydration, attachment paths, log path;
- exit code identical in both modes.

Coverage: for each test framework the benchmark repos use (Playwright: `rr7-epic-stack`, `next-turbopack-boilerplate`; RTL on Vitest: `webpack-portainer`, `rr7-epic-stack`; Vitest browser mode: `vite-shadcn-admin`, `next-turbopack-boilerplate`; Rstest: `rsbuild-rsdoctor`) one happy path and one failure; for each bundler repo one compile/build error; for each SSR repo one hydration mismatch, using the existing `hydration-*` tasks. Runs need the repo base images (Docker), so they run in the benchmark job, not in the packages' unit-test CI. These are the only numbers this work will publish.

### 11.4 New benchmark tasks

The 32 existing tasks are mostly scenario 3 (fix failures) plus UI locate-and-edit. Add, on the existing repos and with the same `task.json` schema:

| Scenario | Task type | Repos (framework already in the repo) | Grading |
|---|---|---|---|
| 1 | Write component / e2e tests until green | `rr7-epic-stack` (Vitest + RTL, Playwright), `webpack-portainer` (Vitest + RTL, React 17), `vite-shadcn-admin` (Vitest browser), `next-turbopack-boilerplate` (Playwright, Vitest browser) | new test passes on the solution **and** fails on a hidden mutant of the component (`hidden-test` step), so trivial tests do not pass |
| 2 | Implement UI with dev server and e2e in the loop | `next-turbopack-boilerplate`, `rr7-epic-stack`, `vite-shadcn-admin`, `tanstack-start-trellaux` | hidden e2e / component test |
| 3 | Fix failing front-end tests / hydration / compile errors | all 8 (existing tasks) + one failing-e2e task on `rr7-epic-stack` | existing `check.steps` |

Two tasks per repo listed for scenarios 1 and 2 (16 new tasks). None of the 8 repos uses Cypress; see decision 5 in section 13.

Mapping existing categories: `ui-locate-edit` counts as scenario 2; `runtime-error`, `ssr-error`, `hydration`, `build-type-error`, `state-bug` count as scenario 3.

**Oracle must pass for every task in all four arms** (`run-oracle-batch.mjs` extended from `control|agentic` to the four arms).

### 11.5 Known gaps

1. **Arms identical to control in 4 repos.** Closed by 6.3 (`webpack-portainer` overlay), 6.4 (`next-turbopack-boilerplate`), 6.5 (`rsbuild-rsdoctor`), 6.6 (`astro-web-check`). The four-arm oracle run checks that each repo's `agentic-react` variant actually differs from control (overlay applied, adapter loaded).
2. **`webpack-portainer` installs with `--no-frozen-lockfile`.** The repo pins `packageManager: pnpm@10.26.2`. Install with that exact pnpm through corepack and `--frozen-lockfile`; if the `pnpmfileChecksum` mismatch remains, pin the lockfile the base image produces as a committed setup artefact. Either way the install becomes frozen.
3. **Browser tools for control:** 11.2.
4. **Task checks that do not behave as written:** `astro-web-check/ssr-home-background-window` (check passes with the bug unless `BOSS_SERVER=true`), `rsbuild-rsdoctor/state-bundle-size-sort-order` (test filter ignored), `next-turbopack-boilerplate/validation-counter-range` (silent check). Details in 8.5; fixed and re-run through the oracle before any arm comparison.

### 11.6 Metrics: the 20% target and the success-rate floor

Defined now, before any real run, extending `benchmark/METRICS.md`:

- **Trial:** one agent run on one task in one arm. At least 3 trials per task per arm.
- **Success:** all non-optional `check.steps` pass (unchanged).
- **total_tokens per trial** = non-cached input + cached input + output tokens, as reported by the agent (Codex input normalised as `METRICS.md` describes).
- **tool_output_tokens per trial** = o200k token count of all tool output text the agent received (the text behind `tool_output_chars`).
- **Per task:** median over the arm's trials, computed only on tasks where **every compared arm** has a majority of successful trials; token medians use successful trials only.
- **Per scenario:** median over tasks of the ratio arm / control.
- **Headline ratio:** weighted mean of scenario medians with weights 0.4 (scenario 1), 0.4 (scenario 2), 0.2 (scenario 3), matching the brief's weighting towards the first two. 95% CI by bootstrap over tasks within each scenario (10,000 resamples).
- **20% target met** when the headline total_tokens ratio for the `agentic-react` arm is ≤ 0.80 and the CI's upper bound is < 1.00. The same numbers are reported for `both`, `agentic-node` and `vitest-agent`, plus per scenario, per bundler, and for tool_output_tokens, turns and wall time.
- **Success-rate floor ("tiny loss"):** pooled trial pass rate of the arm ≥ control's pooled pass rate − **3 percentage points**, **and** no task where control passes a majority of trials while the arm passes none. Any violation is reported as a loss regardless of token savings, and each lost task gets a raw-log review. With ~48 tasks × 3 trials, one task flipping fully moves the pooled rate by ~2 points, so 3 points tolerates noise but not a lost task plus noise.

This work stops at fixtures and oracle runs; the real runs (Cursor `composer-2.5`, `grok-4.7`) come later.

## 12. Risks

| Risk | Mitigation |
|---|---|
| Root cause outside the DOM excerpt | candidate list, excerpt widens when no candidate scores well, fixture assertions on preserved facts, raw log always printed |
| Producer-side hooks break across versions (testing-library `getElementError`, Vitest browser locator errors, Cypress `fail`, Playwright fixtures) | support the versions in the 8 repos and latest; one fixture per framework major in CI; unknown shapes pass through |
| Vitest browser mode has no official error hook | spike first; if no stable hook exists, ship only console capture for browser mode and say so in the README |
| Seven bundler targets | ordered list (6.1) and a concrete "supported" definition; a target ships only when all four conditions pass |
| Source mapping accuracy (Turbopack, Astro islands, React 17) | declaration-line fallback is labelled `(component)`; fixtures assert `file:line` per bundler; wrong-looking mappings are dropped, not guessed |
| Double rewriting with agentic-node | producer vs runner split (section 9), "both" template uses one reporter, fixtures run in the `both` configuration too |
| Silencing stock output in webpack / Next breaks other plugins | intercept only where a clean hook exists, otherwise leave stock output and skip the digest |
| Version drift (React 19 warning formats, Next majors, Playwright/Cypress majors) | warning families matched by stable fragments; unknown text passes through deduped |
| Fairness of browser-tool decision | same tool in all arms (11.2), reported in results |
| Stock tools already adapting to agents (Vitest ≥ 4.1 agent reporter, Vite 8 `forwardConsole`, Next 16.4 agent rules and upgrade prompt, Astro 7.4 background dev, Rstest agent output) | measure against the agent-adapted stock behaviour, not the human default (11.1); captures record both where they differ |
| Non-deterministic baselines (repeated dev-server errors vary run to run) | report fixture token counts as medians over several runs; do not quote a single run as typical |

## 13. Decisions requested in review

1. **Package layout:** one new `@agentic-react/test` package with subpath exports (proposed) vs one package per framework.
2. **Browser tool for all arms:** `playwright-cli` in every arm (proposed) vs none vs chrome-devtools-mcp.
3. **Pass-rate floor:** −3 percentage points pooled + no fully lost task (proposed).
4. **Scenario weights:** 0.4 / 0.4 / 0.2 (proposed).
5. **Cypress coverage:** none of the 8 benchmark repos uses Cypress, so nothing in this design measures it yet. Options: (a) add Cypress e2e to one benchmark repo through committed setup edits (proposed: `vite-shadcn-admin`, a CSR app with no e2e suite today), so Cypress is measured on a real project like everything else; (b) ship the Cypress integration without benchmark numbers in this work.
6. **Default mode:** compact by default once installed, `AGENTIC_REACT_OUT=raw` to opt out (proposed) vs opt-in compact.
7. **Turbopack terminal output:** left untouched in V1 (proposed), browser-side capture only.
8. **React warnings in passing tests:** keep one deduped line per warning with its source (proposed) vs drop them like Vitest's agent reporter does. Proposed because an agent that never sees an `act`/`key` warning cannot fix it, and the brief's tie-break says output more when unsure.
9. **Evidence files:** the benchmark captures are committed unmodified under `docs/test-compression/before/<repo>/` so every number in section 8 can be recomputed (proposed).
