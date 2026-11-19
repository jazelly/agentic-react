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
  The excerpt keeps the candidate's ancestors up to the nearest landmark/form and its siblings, collapses unrelated subtrees to `<… 12 nodes>`, and strips class-name noise. If no candidate scores above a threshold, it falls back to a larger excerpt (whole nearest landmark), never to nothing. The digest never contains ANSI codes (testing-library colours its dump even when `NO_COLOR` is set; see 8.2), and the raw log gets the uncoloured full dump.
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

Where the dedupe happens: in Playwright and Cypress, in the fixture / support file, summarised by the reporter for the whole run. In Vitest and Jest, test files run in isolated module scopes, so the setup file dedupes per test file and prints one summary line per file from `afterAll` (see the RTL warnings target in 8.2). It does not try to dedupe across files; that would need shared state for little gain. Under Vitest's agent reporter, console output of passing files is dropped, including this summary; failing files keep it.

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
- **Repeated errors:** identical error blocks (same message, file, position) print once, followed by one `same error repeated: … xN` line when the burst ends. The capture in 8.2 shows Vite 8 printing the same `Pre-transform error` block 63 to 5,780 times after one broken import.
- **Browser:** Vite 8 already forwards the browser console to the terminal when it detects an agent (`forwardConsole`), so React warnings arrive there as repeated multi-line `[console.error]` entries. The logger dedupes those and annotates them with component + source from the page runtime. On Vite majors without `forwardConsole`, or when it is off, the existing client runtime forwards deduped errors and React warnings over the existing bridge instead. Either way the agent reads them in the dev-server output it already has, without opening a browser tool just for the console.
- To verify in the spike: that `customLogger` set from a plugin `config` hook is honoured by the installed Vite majors (6, 7, 8), and how `forwardConsole` lines reach the logger.

### 6.3 webpack and Next (webpack mode)

- A webpack plugin taps `compiler.hooks.done` and prints a digest of `stats.compilation.errors`/`warnings`: module path → `file:line:col`, loader name, message, trimmed code frame, deduped `ModuleNotFoundError` chains. The stock stats output goes to the raw log. How to suppress the stock printing without changing `stats` semantics for other plugins (CLI vs `webpack-dev-server` vs Next's own printer) is verified per host in the spike.
- Next webpack mode reuses this inside `withAgenticReactNext`'s `webpack()` hook; Next prints its own compile errors, so for Next the digest replaces Next's error block only when we can intercept it cleanly, otherwise it is skipped (no double printing).
- `webpack-portainer` overlay: wrap the CJS `webpack/webpack.common.js` export with the adapter's CJS entry and leave the AngularJS entry untouched (fixes known gap 1 for this repo).

### 6.4 Next with Turbopack

Turbopack does not run webpack plugins, so the current adapter has no effect. Path:

- client runtime injection through `instrumentation-client.ts` (Next ≥ 15.3) instead of a webpack entry;
- the bridge server and MCP start from `instrumentation.ts` `register()` in dev on their own port, since there is no dev-server middleware hook;
- compile errors: Turbopack prints them itself; we digest what reaches the browser overlay / `__nextjs_original-stack-frames` and leave the terminal untouched in V1;
- source mapping uses Next's original-stack-frames endpoint, which the core already calls.

### 6.5 Rsbuild / Rspack

`@agentic-react/rsbuild` is an Rsbuild plugin: `modifyRsbuildConfig` injects the client entry, `dev.setupMiddlewares` mounts the bridge and MCP, `onDevCompileDone` / `onAfterBuild` digest Rspack stats errors with the same formatter as webpack (Rspack's stats are webpack-compatible). Plain Rspack users use `@agentic-react/webpack`, which only uses webpack-compatible APIs.

### 6.6 Astro islands

`@agentic-react/astro` is an Astro integration: `astro:config:setup` adds the Vite plugin through `updateConfig` and injects the client runtime with `injectScript('page', …)`. Each React island is its own React root; the runtime tracks all roots so annotation works per island. Compile errors come from Vite and reuse 6.2.

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

- **Before = real output.** A throwaway fixture app (Vite 8 + React 19.3 + React Router, a settings page and a tasks page, ~10 components) was run with the stock tools: `@playwright/test` 1.65.1, Cypress 16.3.0, Vitest 5.1.1 (jsdom 31 + `@testing-library/react` 16.3.3, and browser mode with `@vitest/browser-playwright`), webpack 5.112.2, Node 24.15. Commands ran non-TTY with `CI` unset and `NO_COLOR=1 FORCE_COLOR=0`, with all AI-agent env markers removed, unless the case name ends in `.agent` (then `CLAUDECODE=1` and `AI_AGENT` set, i.e. what an agent in Claude Code sees). The files are committed unmodified in [`docs/test-compression/before/`](test-compression/before/), each with a `.meta.txt` that has the exact command, versions, env and exit code.
- **After = hand-written target, not output of any code.** Nothing is implemented. Each file in [`docs/test-compression/after/`](test-compression/after/) is the digest this design commits to produce for the same run, written by hand from the real capture. Where agentic-react only replaces part of the output (testing-library, Vitest browser mode), the target was made by splicing the block into the real capture, so the runner's own lines are unchanged.
- **Tokens:** o200k_base via `gpt-tokenizer` 4.1.2, computed by [`docs/test-compression/compare.mjs`](test-compression/compare.mjs).

These counts are **targets that the fixtures (11.3) must meet or beat**, not measurements of agentic-react. They are not evidence for the 20% goal: tool output is only part of an agent's total tokens.

### 8.2 Token counts

| Case | Before (real) | After (target) | Change |
|---|---:|---:|---:|
| Playwright, 20 passing | 534 | 58 | -89.1% |
| Playwright, 1 locator failure | 831 | 314 | -62.2% |
| Cypress, 10 passing | 749 | 91 | -87.9% |
| Cypress, 1 failure | 930 | 300 | -67.7% |
| RTL `Unable to find` (Vitest + jsdom) | 11,227 | 681 | -93.9% |
| RTL, 16 passing with React `key`/`act` warnings | 770 | 307 | -60.1% |
| Vitest browser mode, locator failure | 4,298 | 773 | -82.0% |
| Hydration mismatch, browser console | 744 | 188 | -74.7% |
| Vite dev server, broken import (agent env) | 26,183 | 267 | -99.0% |
| webpack, broken import | 1,034 | 122 | -88.2% |

Things the captures showed that matter for the design:

1. **Playwright output is already lean on the happy path**; the absolute saving there is small (534 → 58). The Playwright "before" excludes 14 `NO_COLOR is ignored` Node warnings that were an artefact of the capture env. On failure, Playwright prints a pointer to `error-context.md` (an ARIA snapshot of the page, 1,884 tokens here), which an agent usually opens next; failure + that file is 2,715 tokens. The target block inlines a source-mapped excerpt so that read becomes unnecessary; the path is still printed.
2. **The RTL dump is mostly ANSI codes.** `@testing-library/dom` ignores `NO_COLOR` and only honours `COLORS=false`, so an agent gets colour codes in a non-TTY. The same dump without colour is 3,633 tokens. The digest never emits ANSI.
3. **Vitest already has an agent reporter.** `--reporter=agent` is Vitest's `minimal` reporter, and Vitest selects it by default when `std-env` detects an agent (`CLAUDECODE`, `AI_AGENT`, `CURSOR_AGENT`, `CODEX_*`, …). It prints only failures and drops console output of passing tests (`silent: 'passed-only'`): the warning run is 125 tokens with it, so the warnings disappear entirely. Our target (307) is deliberately larger, because it keeps one deduped line per React warning with its source. That is a tie-break choice for review (13). On failures the agent reporter prints the same testing-library dump as the default reporter, so the RTL and browser-mode savings stack with it.
4. **Vite 8 forwards the browser console to the terminal when it detects an agent** (`forwardConsole`). In the agent run, Playwright's `[WebServer]` output then carries 11 copies of the same React `key` warning. Section 6.2 is adjusted: agentic-react dedupes and annotates what Vite forwards rather than opening a second channel.
5. **Vite repeats `Pre-transform error` blocks.** After one broken import, Vite 8.3.8 printed the same 8-line block 107 times in the agent run; other runs of the same flow printed 63 to 5,780 copies, so 26,183 tokens is not a stable baseline. The cause is not investigated yet. Deduping identical errors is the single largest saving found.

### 8.3 Examples

Long absolute paths of the fixture directory are shortened to `<fixture>` below for reading; the committed files are unmodified. `[… N lines]` marks lines left out of this page only.

**Playwright, locator failure.** Before (real, list reporter, capture-env warnings removed):

```text
Running 20 tests using 14 workers
[1/20] [chromium] › e2e/navigation.spec.ts:21:1 › sidebar lists projects
[… 18 lines, one per test]
[20/20] [chromium] › e2e/tasks.spec.ts:39:1 › adds a new task
  1) [chromium] › e2e/settings.spec.ts:12:1 › saves profile changes ────────────────────────────────

    Test timeout of 30000ms exceeded.

    Error: locator.click: Test timeout of 30000ms exceeded.
    Call log:
      - waiting for getByRole('button', { name: 'Save', exact: true })

      13 |   await page.getByLabel('Full name').fill('Maya Chen-Park');
      14 |   await page.getByLabel('Bio').fill('Engineering manager');
    > 15 |   await page.getByRole('button', { name: 'Save', exact: true }).click();
         |                                                                 ^
      16 |   await expect(page.getByRole('status')).toHaveText('Profile saved.');
        at <fixture>/e2e/settings.spec.ts:15:65

    Error Context: test-results/settings-saves-profile-changes-chromium/error-context.md

  1 failed
    [chromium] › e2e/settings.spec.ts:12:1 › saves profile changes ─────────────────────────────────
  19 passed (31.0s)
```

After (target, fixture + standalone reporter):

```text
playwright: 1 failed, 19 passed (chromium, 14 workers) in 31.0s
  React warnings (all tests): key x11 <TaskTable> src/components/TaskTable.tsx:30

FAIL e2e/settings.spec.ts:12 › saves profile changes
  locator.click: Test timeout of 30000ms exceeded.
  waiting for getByRole('button', { name: 'Save', exact: true })
    > 15 |   await page.getByRole('button', { name: 'Save', exact: true }).click();
  no match; closest: button "Save changes" <ProfileForm> src/components/ProfileForm.tsx:43
    <form aria-labelledby="profile-heading">   (form "Profile")
      <h2>Profile</h2>
      <… 4 labelled fields: Full name, Email address, Bio, Time zone>
      <button type="button">Reset</button>
      <button type="submit">Save changes</button>   <- closest
    </form>
  other buttons: "Maya Chen" <UserMenu> src/components/UserMenu.tsx:7, "Delete account" <SettingsPage> src/routes/SettingsPage.tsx:20
  browser console (this test): no errors
  error context: test-results/settings-saves-profile-changes-chromium/error-context.md
[agentic-react] full output: .agentic-react/logs/1119-154301-30566.log
```

**RTL `Unable to find`.** Before (real; 869 lines, ANSI codes removed for this page):

```text
 FAIL  tests/rtl-fail/SettingsPage.test.tsx > SettingsPage > saves the profile
TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "Save"

Here are the accessible roles:

  banner:

  Name "":
  <header
    class="app-header"
  />

  --------------------------------------------------
  link:

  Name "Acme Workspace":
  <a
    class="logo"
    href="/"
  />
[… ~780 lines: every accessible role on the page, then the whole document.body pretty-printed]
</body>
 ❯ Object.getElementError node_modules/@testing-library/dom/dist/config.js:37:19
 [… 3 node_modules frames]
 ❯ tests/rtl-fail/SettingsPage.test.tsx:21:29
     21|     await user.click(screen.getByRole('button', { name: 'Save' }))
```

After (target; only the error body changes, Vitest's own lines are untouched):

```text
 FAIL  tests/rtl-fail/SettingsPage.test.tsx > SettingsPage > saves the profile
TestingLibraryElementError: Unable to find role="button" name="Save"
  closest: button "Save changes" <ProfileForm> src/components/ProfileForm.tsx:43
    <form aria-labelledby="profile-heading">   (form "Profile")
      <h2>Profile</h2>
      <… 4 labelled fields: Full name, Email address, Bio, Time zone>
      <button type="button">Reset</button>
      <button type="submit">Save changes</button>   <- closest
    </form>
  other buttons: "Maya Chen" <UserMenu> src/components/UserMenu.tsx:7, "Delete account" <SettingsPage> src/routes/SettingsPage.tsx:20
  [agentic-react] full output: .agentic-react/logs/1119-154301-30566.log
 ❯ Object.getElementError node_modules/@testing-library/dom/dist/config.js:37:19
 [… unchanged]
```

**Hydration mismatch in the browser console** (as a browser tool would list it). Before (real):

```text
[pageerror] Error: Hydration failed because the server rendered text didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:
[… 9 lines of generic causes and a link]
  <BrowserRouter>
    <Router basename={undefined} location={{pathname:"/", ...}} navigationType="POP" navigator={{action:"POP", ...}} ...>
      <AppShell lastSyncedAt={1795017600000}>
        <div className="app-shell">
          [… 8 lines of tree]
                  <SyncStatus lastSyncedAt={1795017600000}>
                    <p className="sync-status">
                      <time>
+                       11/18/2026, 8:00:00 AM
-                       11/18/2026, 4:00:00 PM

    at throwOnHydrationMismatch (http://localhost:5292/node_modules/.vite/deps/react-dom_client.js?v=6d83223d:3120:51)
    [… 9 more react-dom frames]
```

After (target):

```text
[pageerror] Hydration failed (text mismatch): server "11/18/2026, 4:00:00 PM" vs client "11/18/2026, 8:00:00 AM"
  at <time> in <SyncStatus> ssr/SyncStatus.tsx:4
  via <ActivityPanel> ssr/ActivityPanel.tsx:11 < <AppShell> ssr/AppShell.tsx < <Router> < <BrowserRouter>
  common causes: Date/locale formatting, Date.now()/Math.random(), typeof window branches. https://react.dev/link/hydration-mismatch
  (react-dom frames x10 and full message in log)
```

**Vite dev server, broken import (agent env).** Before (real): the startup banner, one `Internal server error` block with 9 `node_modules/vite` frames, then this 8-line block **107 times**:

```text
3:50:12 PM [vite] (client) Pre-transform error: Failed to resolve import "./DoesNotExist" from "src/components/ProfileForm.tsx". Does the file exist?
  Plugin: vite:import-analysis
  File: <fixture>/src/components/ProfileForm.tsx:2:29
  1  |  import { useState } from "react";
  2  |  import { isValidEmail } from "./DoesNotExist";
     |                                ^
  3  |  var _jsxFileName = "<fixture>/src/components/ProfileForm.tsx...
  4  |  import { jsxDEV as _jsxDEV } from "react/jsx-dev-runtime";
```

After (target):

```text
3:50:12 PM [vite] (client) hmr update /src/components/ProfileForm.tsx
3:50:12 PM [vite] error: Failed to resolve import "./DoesNotExist" from "src/components/ProfileForm.tsx". Does the file exist?
  at src/components/ProfileForm.tsx:2:29 (vite:import-analysis)
    2 | import { isValidEmail } from "./DoesNotExist";
      |                               ^
3:50:12 PM [vite] (client) [console.error] [vite] Failed to reload /src/components/ProfileForm.tsx. This could be due to syntax errors or importing non-existent modules. (see errors above)
3:50:12 PM [vite] same error repeated: internal server error x2, pre-transform error x107 (last 3:50:14 PM)
[agentic-react] full output: .agentic-react/logs/1119-154301-30566.log
```

**Cypress, 10 passing.** Before (real, 95 lines): a run-start box (Cypress, browser, Node, specs), an Electron deprecation warning, per spec a header, the test list and a 9-row results box, then a run-finished table. After (target):

```text
cypress: 10 passed in 2 specs (Electron 150 headless) in 2s
  settings.cy.ts 5/5, tasks.cy.ts 5/5
  warning: Electron is deprecated as a test browser (details in log)
  browser console: no errors; React warnings: none
[agentic-react] full output: .agentic-react/logs/1119-154301-30566.log
```

The remaining targets (Cypress failure, RTL warnings, Vitest browser mode, webpack) are in [`docs/test-compression/after/`](test-compression/after/) next to their captures.

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

**Agent env markers are part of the arm definition.** Vitest switches to its agent reporter and Vite 8 turns on `forwardConsole` when they see `CLAUDECODE`, `AI_AGENT`, `CURSOR_AGENT` and similar variables (8.2). So the stock behaviour of `control` depends on which agent runs it. The harness sets the same markers in every arm (whatever the agent under test sets naturally), records them and the Vitest reporter actually selected in each result, and the `vitest-agent` arm forces `--reporter=agent` so that comparison does not depend on detection.

Every arm gets the same `AGENTS.md`/prompt, except that the `agentic-react` and `both` arms keep the short snippet (its tokens are counted). The current snippet (`benchmark/arms/agentic/AGENTS.snippet.md`) says "Long command output is compacted", which is not true until this work ships; it must stay out of runs until then.

### 11.2 Fairness: browser tools

**Proposal: every arm, control included, gets the same browser tool: `playwright-cli`.** Reasoning:

- Users this project targets (people building sites with AI) run with a browser in the loop. A control with no way to see the page understates real token cost and makes scenario 2 and 3 tasks fail or loop for reasons that have nothing to do with output compression, which inflates any gain.
- The measured question is "does agentic-react make the same loop cheaper", so both arms must have the same loop.
- `playwright-cli` over chrome-devtools-mcp: its output arrives as plain shell output, so it is counted by `tool_output_chars` the same way for every agent, and it needs no per-agent MCP configuration. agentic-react's console wrapper in the page also shortens what `playwright-cli` prints (console messages are produced by the page), so the gain stays measurable through it.
- The existing agentic-react MCP stays in the `agentic-react` and `both` arms only, as today; its tool descriptions are part of that arm's paid context.

### 11.3 Fixtures (deterministic, no model)

Under `benchmark/fixtures/<framework-or-bundler>/<case>/`: a small app + a command, captured output, and a list of facts that must survive compression. A runner executes each case twice (`AGENTIC_REACT_OUT=raw` and compact) and checks:

- o200k token count raw vs compressed (reported, per case);
- every preserved fact appears in the digest: failing test title, failing step, locator / query, component name, `file:line`, error message, server vs client values for hydration, attachment paths, log path;
- exit code identical in both modes.

Cases: for each framework (Playwright, Cypress, RTL on Vitest and Jest, Vitest browser) one happy path, one locator/query failure, one run with repeated React warnings; for each bundler one compile error and, where the framework renders on the server, one hydration mismatch. These run in CI and are the only numbers this work will publish.

### 11.4 New benchmark tasks

The 32 existing tasks are mostly scenario 3 (fix failures) plus UI locate-and-edit. Add, on the existing repos and with the same `task.json` schema:

| Scenario | Task type | Repos (framework already in the repo) | Grading |
|---|---|---|---|
| 1 | Write component / e2e tests until green | `rr7-epic-stack` (Vitest + RTL, Playwright), `webpack-portainer` (Vitest + RTL, React 17), `vite-shadcn-admin` (Vitest browser), `next-turbopack-boilerplate` (Playwright, Vitest browser) | new test passes on the solution **and** fails on a hidden mutant of the component (`hidden-test` step), so trivial tests do not pass |
| 2 | Implement UI with dev server and e2e in the loop | `next-turbopack-boilerplate`, `rr7-epic-stack`, `vite-shadcn-admin`, `tanstack-start-trellaux` | hidden e2e / component test |
| 3 | Fix failing front-end tests / hydration / compile errors | all 8 (existing tasks) + one failing-e2e task on `rr7-epic-stack` | existing `check.steps` |

Two tasks per repo listed for scenarios 1 and 2 (16 new tasks). None of the 8 repos uses Cypress; Cypress is covered by fixtures only unless review decides otherwise (13).

Mapping existing categories: `ui-locate-edit` counts as scenario 2; `runtime-error`, `ssr-error`, `hydration`, `build-type-error`, `state-bug` count as scenario 3.

**Oracle must pass for every task in all four arms** (`run-oracle-batch.mjs` extended from `control|agentic` to the four arms).

### 11.5 Known gaps

1. **Arms identical to control in 4 repos.** Closed by 6.3 (`webpack-portainer` overlay), 6.4 (`next-turbopack-boilerplate`), 6.5 (`rsbuild-rsdoctor`), 6.6 (`astro-web-check`). The four-arm oracle run checks that each repo's `agentic-react` variant actually differs from control (overlay applied, adapter loaded).
2. **`webpack-portainer` installs with `--no-frozen-lockfile`.** The repo pins `packageManager: pnpm@10.26.2`. Install with that exact pnpm through corepack and `--frozen-lockfile`; if the `pnpmfileChecksum` mismatch remains, pin the lockfile the base image produces as a committed setup artefact. Either way the install becomes frozen.
3. **Browser tools for control:** 11.2.

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
| Stock tools already adapting to agents (Vitest agent reporter, Vite `forwardConsole`, Playwright `error-context.md`) | measure against the agent-adapted stock behaviour, not the human default (11.1); targets in 8.2 are stated against both where they differ |
| Non-deterministic baselines (Vite's repeated pre-transform errors varied 63–5,780 copies) | report fixture token counts as medians over several runs; do not quote a single run as typical |

## 13. Decisions requested in review

1. **Package layout:** one new `@agentic-react/test` package with subpath exports (proposed) vs one package per framework.
2. **Browser tool for all arms:** `playwright-cli` in every arm (proposed) vs none vs chrome-devtools-mcp.
3. **Pass-rate floor:** −3 percentage points pooled + no fully lost task (proposed).
4. **Scenario weights:** 0.4 / 0.4 / 0.2 (proposed).
5. **Cypress coverage:** fixtures only (proposed, no benchmark repo uses Cypress) vs adding Cypress to one benchmark repo through setup edits.
6. **Default mode:** compact by default once installed, `AGENTIC_REACT_OUT=raw` to opt out (proposed) vs opt-in compact.
7. **Turbopack terminal output:** left untouched in V1 (proposed), browser-side capture only.
8. **React warnings in passing tests:** keep one deduped line per warning with its source (proposed; costs a few hundred tokens, see the RTL warnings case in 8.2) vs drop them like Vitest's agent reporter does. Proposed because an agent that never sees an `act`/`key` warning cannot fix it, and the brief's tie-break says output more when unsure.
9. **Evidence files:** the real captures and hand-written targets are committed under `docs/test-compression/` so every number in section 8 can be recomputed (proposed). They move to `benchmark/fixtures/` as real fixtures in the fixtures step.
