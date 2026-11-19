# Brief: front-end test and verification output compression for agentic-react

Status: approved brief, ready to implement. This document is the source of truth for the work. Its first deliverable is a design doc, `docs/test-compression.md`, written before any implementation (see [Process](#16-process)).

Sibling brief: `jazelly/agentic-node` → `docs/briefs/test-output-compression.md`. The two projects are independent. Read [Boundary](#8-boundary) before you start.

---

## 1. Purpose

Prove, with real agent runs, that installing agentic-react makes AI agents spend **significantly fewer tokens** while developing and testing front-end / React code, with the **same success rate**.

- **Token target:** at least **20% fewer tokens** on the measured scenarios. This is a floor, not a marketing number.
- **Success rate:** must not drop noticeably. A tiny loss within run-to-run noise is tolerable. A visible drop is not acceptable, whatever the token savings.
- **Tie-break rule:** if a compression puts accuracy at risk, **output more, not less**. A failed task costs more tokens in retries than the compression saved.

"Measured scenarios" means the benchmark tasks and fixtures defined in [Benchmark methodology](#13-benchmark-methodology).

## 2. Open-source impact goal

This is an open-source project. The goal is open-source impact, not revenue.

- **There is no buyer.** Adoption is the metric.
- **Users:** anyone using AI (Claude Code, Cursor, Codex, and so on) to build websites or front-end apps in the JS ecosystem. Every "build me a site" or "add this page" workflow runs a bundler, a dev server, and usually a browser in the loop.
- **Ambition:** become the layer people add to any front-end project an AI works on, whatever the bundler or framework.

What follows: credibility over speed (every published number must be reproducible), breadth of bundler and framework coverage, and safe defaults.

## 3. One-line positioning

> **The front-end layer for AI agents: browser, DOM, React, and bundler output compressed into exactly what the agent needs, mapped back to source, across every major bundler and framework.**

### Relationship to existing work

agentic-react's earlier work, giving agents component context when a UI element is selected (component name, stable selector, source file, nearby code, owner trace, tuning prompts; packages `core`, `vite`, `webpack`, `next`), exists and stays. It is documented in the README with its own benchmark (three-area source-location study). It is **not the focus** of this work, but its component-location capability is reused here (see [10.4](#104-component-and-source-mapping)).

The new focus is **compressing the output of front-end development and testing**. That output is tied to the bundler and the browser runtime, so **broad bundler and framework compatibility is the core value and the main differentiator.**

## 4. Why now

- **Agents are moving from shell to JS.** Claude Code has started having agents write and run JavaScript directly instead of shell commands. The JS toolchain is becoming the agent's execution layer.
- **Anthropic acquired Bun.** Runtime-level efficiency for agents (tokens and time per loop) is now a contested track, which validates the thesis.
- **Front-end is where loops are heaviest.** Dev server, HMR, browser, e2e, visual and UX checks: each loop emits more output than a backend unit test run, and it is less structured.
- **The opportunity:** be the open, bundler-agnostic layer for this, not tied to one runtime, one bundler, or one agent product.

## 5. Core thesis

AI-driven front-end development runs **verification loops** constantly: dev server and HMR output, build output, component tests, e2e/QA tests (Playwright, Cypress), checking whether the UX meets expectations. A task can run tens of loops, and every redundant line is paid for every time and then stays in context.

**The happy path is the big cost, not only failures.** Even when everything passes, front-end tooling produces huge output: full DOM dumps, traces, repeated React warnings, bundled stacks pointing at chunk files, verbose dev-server logs. Agents spend most of their loops in that mostly-green state.

The job is to shrink that output while keeping everything the agent needs to act, **and map it back to source**: which component, which file and line.

## 6. Priority scenarios

1. **AI writing front-end tests** until green: component tests with React Testing Library, e2e with Playwright or Cypress. Mostly happy-path output.
2. **AI developing UI with repeated verification loops:** dev server / HMR, e2e and QA checks, UX checks. Mostly passing.
3. **AI fixing failures:** failing tests, hydration errors, compile and dev-server errors.

The benchmark must cover all three, weighted towards the first two.

## 7. Competitive advantage

- **Beyond Vitest's agent reporter.** It covers only Vitest and only generic test output. agentic-react covers the browser runtime, DOM, and React semantics across Vite, webpack, Rspack/Rsbuild, Turbopack/Next, Astro, TanStack Start, and React Router v7.
- **Source mapping is unique.** DOM nodes, errors, and warnings are mapped back to **component name + source file:line**, reusing agentic-react's existing component-location capability. Generic tools cannot do this because they do not see the React tree or the bundler's sourcemaps.
- **Structure-aware, not blind truncation.** Agent products truncate long tool output on their side (head/tail, character limits) and can cut the root cause. agentic-react understands DOM dumps, Playwright steps, React warnings, and bundler errors, and compresses semantically.
- **Incremental across loops** where it applies to front-end output: repeated warnings and unchanged dev-server state are not reprinted every loop.
- **Lossless by construction.** Raw output is saved to a file and the path is printed. Traces, videos, and screenshots are referenced by path, never deleted.
- **Safe by default.** Never hides failures, never changes exit codes; raw passthrough on parse failure.

## 8. Boundary

**agentic-node** is a completely independent project. It compresses everything generic on the Node.js runtime for any runner: pass/fail counts, assertion diffs, stack cleanup, dedupe, incremental reruns, generic dev-server and build log noise.

**agentic-react owns only what is front-end specific:**

- DOM (RTL dumps, DOM snippets at failure time)
- browser runtime (browser console, page errors, network errors as reported by the test tool)
- React semantics (act, key, hydration, deprecation warnings)
- component and source mapping
- bundler specifics (sourcemaps, dev-server / HMR / overlay / compile errors per bundler)

**Independence:**

- no dependency in either direction
- no detection of each other at runtime
- no coordination protocol
- each compresses its own domain

A real front-end project gets the best result by installing both. agentic-react must work correctly on its own, and installing both must not break anything. Keep outputs as plain text so that any other layer can still read them.

Note that most front-end test frameworks actually run in Node (Jest/Vitest with jsdom/happy-dom for RTL; Playwright's runner drives the browser from Node). Their generic layer is agentic-node's job; their DOM / browser / React layer is ours.

## 9. Configuration is not a selling point

Zero-config is not what we sell. Provide a clear, copy-pasteable **config template in the README per bundler and per test framework**, and users install and follow it:

- bundlers: Vite, webpack, Next (webpack and Turbopack), Rsbuild/Rspack, Astro, TanStack Start, React Router v7
- test frameworks: React Testing Library (Jest and Vitest), Vitest browser mode, Playwright, Cypress

Each template: where it goes, the minimal snippet, and what the output looks like afterwards.

## 10. What to build

### 10.1 Test frameworks

Order: **Playwright and Cypress first**, then Vitest browser mode and React Testing Library.

- **React Testing Library:** replace full DOM dumps with the **subtree around the queried target**, plus a short candidate list for "Unable to find" errors (similar roles / labels / text), annotated with component names and source file:line.
- **Playwright / Cypress:** happy path collapsed to step counts. On failure, give the failing step, the locator, a DOM snippet at failure time, and relevant browser console errors. **Not** full traces, videos, or screenshots: print their paths only.
- **React warnings** (act, key, hydration mismatch, deprecations): deduped with counts, attributed to a component and source location.

### 10.2 Bundler adapters

Sourcemap mapping plus dev-server / HMR / overlay / compile output compression.

| Bundler / framework | Status today (see `benchmark/HARBOR.md`) | This work |
|---|---|---|
| Vite | adapter exists (`@agentic-react/vite`) | add output compression |
| webpack | adapter exists (`@agentic-react/webpack`); portainer overlay not automated (CJS entry / Angular hybrid) | add output compression; automate portainer overlay |
| Next (webpack mode) | adapter exists (`@agentic-react/next`) | add output compression |
| Next (Turbopack) | adapter hooks webpack only; Turbopack path TODO | add |
| Rsbuild / Rspack | manifest adapter status `todo` | add |
| Astro | islands / per-root runtime TODO | add |
| TanStack Start | on Vite | verify |
| React Router v7 | on Vite | verify |

### 10.3 Lossless raw output

Full raw output always saved to a file, path printed at the end of every digest.

### 10.4 Component and source mapping

Map DOM nodes, errors, and warnings to component name + source file:line using the existing component-location machinery (the same data that powers the selection context in the README). Mapping failures degrade to "no annotation", never to dropped output.

### 10.5 README config templates

Per bundler and per test framework, as in section 9.

### 10.6 Illustrative before/after examples

**These examples are illustrative only.** They show the intended shape, not measured results. The design doc must replace them with real output from fixtures.

**RTL "Unable to find" (illustrative)**

Before: `TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "Save"` followed by a 300-line pretty-printed DOM of the whole page.

After:

```text
RTL: Unable to find role="button" name="Save"
  near target (ProfileForm, src/components/ProfileForm.tsx:42):
    <form aria-label="Profile">
      <input name="email" />
      <button type="submit">Save changes</button>   <- closest: role=button name="Save changes"
    </form>
  other candidates: button "Cancel" (FormActions, src/components/FormActions.tsx:12)
[agentic-react] full output: .agentic-react/logs/1119-160102.log
```

**Playwright, happy path (illustrative)**

Before: one line per test across 4 workers, retries, the HTML report banner, and trace/video paths for every test.

After:

```text
playwright: 48 passed (chromium) in 31s
  console errors: none; React warnings: key x2 (TaskRow, src/routes/tasks/row.tsx:18)
[agentic-react] full output: .agentic-react/logs/1119-160530.log
```

**Hydration mismatch in a dev server (illustrative)**

Before: the same "Text content does not match server-rendered HTML" warning repeated per render, a component stack through `node_modules/react-dom`, and bundled chunk stack frames.

After:

```text
hydration mismatch x6: server "Nov 19" vs client "19/11/2026"
  at <LastUpdated> src/components/LastUpdated.tsx:9 (via <Header> src/layout/Header.tsx:21)
[agentic-react] full output: .agentic-react/logs/1119-161002.log
```

## 11. Existing evidence

- The README benchmark (three UI areas, source location with cropped screenshots vs agentic-react context: 388,694 → 180,302 total tokens, -53.6%) measures the **old** selection-context feature. It is not evidence for output compression and must not be cited as such.
- **No measurements of output compression exist yet.** This work produces the first ones.

## 12. Existing benchmark

From `benchmark/HARBOR.md` and `benchmark/METRICS.md`:

- **8 pinned real repos** covering Vite (`vite-shadcn-admin`), webpack (`webpack-portainer`), Rsbuild (`rsbuild-rsdoctor`), Turbopack (`next-turbopack-boilerplate`), Next webpack mode (`next-webpack-jsoncrack`), TanStack Start (`tanstack-start-trellaux`), Astro islands (`astro-web-check`), React Router v7 (`rr7-epic-stack`).
- **32 Harbor tasks** in `benchmark/vendor/agentic-react-harbor/tasks`, converted from `benchmark/tasks/**/task.json`.
- **Oracle 64/64** (32 tasks × control + agentic), see `benchmark/experiments/oracle-rewards.csv`.
- **Per-repo cached base images** (`agentic-react/base-<repo>:<cacheKey>`).
- Harness: **primase** (https://github.com/vertile-ai/primase, a Harbor extension), pinned in `benchmark/requirements-primase.txt`.
- Metrics (`METRICS.md`): success = all non-optional `check.steps` pass; primary metrics output_tokens and turns; secondary input/cached tokens, `tool_output_chars`, wall_ms, cost, diffstat. At least 3 reps per task per arm; per-task medians, then median of per-task B/A ratios with bootstrap CI; token/turn comparison only on tasks both arms pass.

## 13. Benchmark methodology

**Rules:**

- **Pass rate is the floor.** A drop is reported on its own and counts as a loss.
- Compare output tokens, wall time, and turns **only on tasks all compared arms pass**.
- Real runs will later use the Cursor subscription with `composer-2.5` and `grok-4.7`. **Not in this work.** This work stops at oracle runs, unit tests, and fixtures.

**Arms:**

| Arm | Meaning |
|---|---|
| `control` | stock pinned repo + setup edits |
| `agentic-node` | agentic-node only (installed per its README template) |
| `agentic-react` | agentic-react only |
| `both` | agentic-node + agentic-react |

This makes each package's contribution measurable. Include **Vitest's agent reporter** as a comparison where relevant (Vitest-based tasks).

**Known gaps to fix:**

1. **Agentic arm equals control in 4 repos** (`webpack-portainer`, `rsbuild-rsdoctor`, `next-turbopack-boilerplate`, `astro-web-check`), because no overlay is applied. Fix with the new adapters so every repo has a real agentic-react arm.
2. **`webpack-portainer` installs with `--no-frozen-lockfile`** (`pnpmfileChecksum` vs `configDependencies` mismatch). That breaks reproducibility; lock it.
3. **Fairness: browser tools for control.** `METRICS.md` currently gives neither arm screenshot or browser tools, and lists whether control gets `playwright-cli` / chrome-devtools-mcp as undecided. Propose an answer in the design doc, with reasoning.

**To add:**

- Task types on the existing repos:
  1. "Write component / e2e tests until green" (scenario 1)
  2. "Implement UI with dev server and e2e in the loop" (scenario 2)
  3. "Fix failing front-end tests / hydration / compile errors" (scenario 3)
- Fixture runs, happy path and failure, measuring o200k tokens raw vs compressed and asserting key info is preserved (failing step, locator, component, file:line, message).
- **Oracle must pass** for all tasks, in all arms.

**How the 20% target is measured:** median per-task ratio of total tokens (and tool output) vs control, on tasks all compared arms pass, with bootstrap CI, per `METRICS.md`. The design doc must define the exact metric before any real run.

## 14. Non-goals

- Generic Node runner compression (counts, diffs, stacks) beyond the minimum needed to work standalone. That is agentic-node's domain.
- Expanding the old selection-context feature.
- Real paid model runs.
- Zero-config auto-detection as a feature.
- Any detection of or coordination with agentic-node.
- Converting `benchmark/xstack` to Harbor.

## 15. Risks and open questions

- **Root-cause loss** when cutting DOM dumps: the needed node might be outside the kept subtree. Mitigation: candidate lists, preservation assertions in fixtures, raw log always available; when unsure, keep more.
- **Bundler breadth vs depth:** seven bundler/framework targets is a lot. The design doc should state an order and what "supported" means for each.
- **Standalone overlap:** working without agentic-node means some generic handling in agentic-react. Keep it minimal and avoid conflicting rewrites when both are installed, without detecting each other.
- **Source mapping accuracy** across bundlers, especially Turbopack and Astro islands.
- **Framework version drift** (Playwright, Cypress, React 19 warnings format, Next majors).
- **Fairness** of the browser-tools decision (see 13).
- **Open question:** concrete threshold for "a tiny loss" in pass rate. Propose one in the design doc.

## 16. Process

1. **First, write `docs/test-compression.md`** as the design doc. It must cover: purpose and positioning (short, link to this brief); per-framework and per-bundler integration point; real before/after output (happy path and failure); the boundary with agentic-node; the fairness proposal; how the 20% target and the success-rate floor will be measured; and the risks. Open it as a PR, then **STOP and wait for Jason's review.** Do not implement anything before approval.
2. After approval: adapters + tests.
3. Then fixtures.
4. Then benchmark tasks and arms, with oracle passing.
5. README config templates alongside the adapters.

## 17. Rules

- Work on a new branch and open a PR. **Do not merge.**
- **No paid model runs.** Oracle and unit tests only.
- **Never print, log, or commit API keys.** Secrets only via env or `~/.config/agentic-node/bench.env`; experiment YAML references it by path only.
- **Don't modify other repos** (including agentic-node and primase).
- Do not invent benchmark numbers. Only cite numbers produced by runs in this repo, and label illustrative output as illustrative.
