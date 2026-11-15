// Shared helpers for the agentic-react benchmark. Zero dependencies (Node >= 22).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const BENCH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPOS = path.join(BENCH, 'repos');
export const TASKS = path.join(BENCH, 'tasks');
export const RUNS = path.join(BENCH, 'runs');

export const manifest = () => JSON.parse(fs.readFileSync(path.join(BENCH, 'manifest.json'), 'utf8'));
export const repoById = (id) => {
  const r = manifest().repos.find((x) => x.id === id);
  if (!r) throw new Error(`unknown repo id ${id}`);
  return r;
};

export function listTasks(filter = '') {
  const out = [];
  for (const repo of fs.readdirSync(TASKS)) {
    const rdir = path.join(TASKS, repo);
    if (!fs.statSync(rdir).isDirectory()) continue;
    for (const t of fs.readdirSync(rdir)) {
      const f = path.join(rdir, t, 'task.json');
      if (!fs.existsSync(f)) continue;
      const task = JSON.parse(fs.readFileSync(f, 'utf8'));
      task.dir = path.join(rdir, t);
      if (!filter || task.id.includes(filter)) out.push(task);
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

export function sh(cmd, { cwd, timeoutSec = 600, env = {}, quiet = false } = {}) {
  const r = spawnSync('bash', ['-lc', cmd], { cwd, env: { ...process.env, CI: '1', ...env }, encoding: 'utf8', timeout: timeoutSec * 1000, maxBuffer: 256 * 1024 * 1024 });
  const output = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (!quiet && r.status !== 0) process.stderr.write(output.slice(-4000));
  return { ok: r.status === 0, status: r.status, output, timedOut: r.error?.code === 'ETIMEDOUT' };
}

/** Apply {file, find, replace, regex?, all?} edits; every edit must match (exactly once unless all). */
export function applyEdits(appRoot, edits, { dryRun = false } = {}) {
  const results = [];
  for (const e of edits ?? []) {
    const file = path.join(appRoot, e.file);
    const src = fs.readFileSync(file, 'utf8');
    let next; let count;
    if (e.regex) {
      const re = new RegExp(e.find, e.all ? 'g' : '');
      count = (src.match(new RegExp(e.find, 'g')) ?? []).length;
      next = src.replace(re, e.replace);
      if (count === 0) throw new Error(`edit did not match: ${e.file} /${e.find}/`);
    } else {
      count = src.split(e.find).length - 1;
      if (count !== 1 && !(e.all && count > 0)) throw new Error(`edit must match once, matched ${count}x: ${e.file} :: ${JSON.stringify(e.find).slice(0, 80)}`);
      next = e.all ? src.split(e.find).join(e.replace) : src.replace(e.find, () => e.replace);
    }
    if (!dryRun) fs.writeFileSync(file, next);
    results.push({ file: e.file, count });
  }
  return results;
}

export const reverseEdits = (edits) => edits.map((e) => {
  if (e.regex) throw new Error('regex setup edits need an explicit solution');
  if (!e.replace) throw new Error(`pure-deletion setup edit in ${e.file} cannot be reversed; include an anchor line in find/replace`);
  return { file: e.file, find: e.replace, replace: e.find };
});

/** Copy-on-write copy of the pinned clone into a scratch workspace, apply setup, commit a scratch baseline. */
export function prepareWorkspace(task, wsDir) {
  const repo = repoById(task.repo);
  const src = path.join(REPOS, repo.id);
  if (!fs.existsSync(src)) throw new Error(`missing clone ${src}; run node scripts/clone.mjs`);
  fs.rmSync(wsDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(wsDir), { recursive: true });
  const cp = os.platform() === 'darwin' ? `cp -cR "${src}" "${wsDir}"` : `cp -a --reflink=auto "${src}" "${wsDir}"`;
  if (!sh(cp).ok) throw new Error('copy failed');
  // Drop upstream history so the agent cannot `git diff` its way to the injected bug.
  fs.rmSync(path.join(wsDir, '.git'), { recursive: true, force: true });
  const appRoot = path.join(wsDir, repo.appDir ?? '.');
  applyEdits(appRoot, task.setup?.edits);
  const g = 'git -c user.email=bench@local -c user.name=bench';
  sh(`git init -q && ${g} add -A && ${g} commit -qm baseline --no-verify`, { cwd: wsDir, quiet: true });
  return { wsDir, appRoot, repo };
}

export function changedFiles(wsDir) {
  const r = sh('git status --porcelain --untracked-files=all', { cwd: wsDir, quiet: true });
  return r.output.split('\n').filter(Boolean).map((l) => l.slice(3).replace(/^.* -> /, ''));
}

/** Paths that tooling rewrites during @build/@typecheck; not agent edits. */
export function isIgnorableChangedPath(f) {
  return (
    /(^|\/)(node_modules|\.next|dist|build|\.astro|\.turbo|\.vite|\.react-router|test-results)\//.test(f) ||
    /(^|\/)next-env\.d\.ts$/.test(f) ||
    /(^|\/)tsconfig\.tsbuildinfo$/.test(f) ||
    /(^|\/)prisma\/data\.db(-journal)?$/.test(f) ||
    /(^|\/)other\/cache\.db(-journal)?$/.test(f)
  );
}

/**
 * Local-path counterpart of Harbor `manifest.harbor.preInstall` + `postInstall`.
 * Idempotent: pin unpublished deps, copy .env, prisma migrate + generate --sql, etc.
 * Call before local `--oracle` when the pinned clone was only `npm ci`/`pnpm install`.
 */
export function ensureRepoReady(repo) {
  const repoRoot = path.join(REPOS, repo.id);
  if (!fs.existsSync(repoRoot)) {
    throw new Error(`missing clone ${repoRoot}; run node scripts/clone.mjs`);
  }
  const appRoot = path.join(repoRoot, repo.appDir ?? '.');
  const pre = []
    .concat(repo.harbor?.preInstall ?? [])
    .map((c) => String(c).trim())
    .filter(Boolean);
  if (pre.length) {
    const cwd = repo.commandsCwd === 'appDir' ? appRoot : repoRoot;
    const r = sh(pre.join(' && '), { cwd, timeoutSec: 300, quiet: true });
    if (!r.ok) throw new Error(`ensureRepoReady(${repo.id}) preInstall failed: ${r.output.slice(-1200)}`);
  }
  const cmds = []
    .concat(repo.harbor?.postInstall ?? [])
    .map((c) => String(c).trim())
    .filter(Boolean);
  if (!cmds.length) return;
  const r = sh(cmds.join(' && '), { cwd: repoRoot, timeoutSec: 1800, quiet: true });
  if (!r.ok) {
    throw new Error(`ensureRepoReady(${repo.id}) failed: ${r.output.slice(-1200)}`);
  }
}

/**
 * Fail fast when host Node is outside the pinned repo engines.node.
 * Harbor images (`manifest.harbor.nodeImage`) are chosen to satisfy the same range.
 */
export function assertHostNodeForRepo(repo) {
  const range = String(repo.engines?.node ?? '').trim();
  if (!range) return;
  const image = repo.harbor?.nodeImage ?? '';
  const major = Number(process.versions.node.split('.')[0]);
  const caret22Only = /^\^22(\.|$)/.test(range) && !range.includes('||');
  const needs24 = />=\s*24/.test(range) || (/\^\s*24/.test(range) && !range.includes('||'));
  // Astro-style unions (^22.23.4 || ^24.16.0 || >=26) — accept 22/24/26 majors present in the union.
  const unionOk =
    range.includes('||') &&
    ((/\^22/.test(range) && major === 22) ||
      (/\^24|>=\s*24/.test(range) && major === 24) ||
      (/>=\s*26|\^26/.test(range) && major >= 26));
  if (unionOk) return;
  if (caret22Only && major !== 22) {
    throw new Error(
      `${repo.id} requires Node 22 (engines.node=${range}, harbor=${image || 'n/a'}); host is v${process.versions.node}.`,
    );
  }
  if (needs24 && major < 24) {
    throw new Error(
      `${repo.id} requires Node >=24 (engines.node=${range}, harbor=${image || 'n/a'}); host is v${process.versions.node}.`,
    );
  }
}

/** Ensure Playwright chromium is present for browser-mode hidden tests / local oracle. */
export function ensurePlaywrightBrowsers(appRoot, repo) {
  const cache = path.join(os.homedir(), '.cache', 'ms-playwright');
  if (fs.existsSync(cache) && fs.readdirSync(cache).some((n) => /chromium/i.test(n))) return;

  let cmd = null;
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
    if (pkg.scripts?.['test:browser:install']) {
      if (repo.packageManager?.startsWith('npm')) cmd = 'npm run test:browser:install';
      else if (repo.packageManager?.startsWith('yarn')) cmd = 'yarn test:browser:install';
      else cmd = 'pnpm --ignore-workspace test:browser:install';
    }
  } catch {
    /* ignore */
  }
  if (!cmd) {
    if (fs.existsSync(path.join(appRoot, 'node_modules', 'playwright')) ||
        fs.existsSync(path.join(appRoot, 'node_modules', '@playwright', 'test'))) {
      cmd = 'pnpm exec playwright install chromium --with-deps || npx playwright install chromium --with-deps';
    }
  }
  if (!cmd) return;
  const r = sh(cmd, { cwd: appRoot, timeoutSec: 600, quiet: true });
  if (!r.ok) throw new Error(`playwright browser install failed: ${r.output.slice(-800)}`);
}

const globToRe = (g) => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\//g, '(?:.*/)?').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$');
const walk = (dir, base = dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
  if (d.name === 'node_modules' || d.name.startsWith('.')) return [];
  const p = path.join(dir, d.name);
  return d.isDirectory() ? walk(p, base) : [path.relative(base, p)];
});

function resolveCmd(run, repo) {
  if (!run.startsWith('@')) return { cmd: run, cwdKind: 'app' };
  const key = run.slice(1);
  const cmd = repo.commands?.[key];
  if (!cmd) throw new Error(`manifest has no commands.${key} for ${repo.id}`);
  return { cmd, cwdKind: repo.commandsCwd === 'appDir' ? 'app' : 'repo' };
}

/** Run all check steps. Returns {success, steps:[{type, ok, detail}]} */
export async function runChecks(task, { wsDir, appRoot, repo }, { includeOptional = false } = {}) {
  const steps = [];
  for (const s of task.check?.steps ?? []) {
    if (s.optional && !includeOptional) { steps.push({ type: s.type, ok: true, skipped: true }); continue; }
    let ok = false; let detail = '';
    try {
      if (s.type === 'regex') {
        const files = s.file ? [s.file] : walk(appRoot).filter((f) => s.files.some((g) => globToRe(g).test(f)));
        const re = new RegExp(s.pattern, s.flags ?? 'm');
        const hit = files.filter((f) => fs.existsSync(path.join(appRoot, f)) && re.test(fs.readFileSync(path.join(appRoot, f), 'utf8')));
        ok = s.expect ? hit.length > 0 : hit.length === 0;
        detail = `${s.expect ? 'expected' : 'forbidden'} /${s.pattern}/ hits=${hit.join(',') || 0}`;
      } else if (s.type === 'only-changed') {
        const prefix = repo.appDir && repo.appDir !== '.' ? repo.appDir.replace(/\/$/, '') + '/' : '';
        // Ignore build/tooling noise (Next rewrites next-env.d.ts on build/typecheck).
        const changed = changedFiles(wsDir).filter((f) => !isIgnorableChangedPath(f));
        const extra = changed.filter((f) => !(f.startsWith(prefix) && s.allow.some((g) => globToRe(g).test(f.slice(prefix.length)))));
        ok = extra.length === 0; detail = extra.length ? `unexpected changes: ${extra.join(', ')}` : `changed: ${changed.join(', ')}`;
      } else if (s.type === 'forbid') {
        const diff = sh('git diff -U0 HEAD', { cwd: wsDir, quiet: true }).output.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).join('\n');
        const m = diff.match(new RegExp(s.pattern));
        ok = !m; detail = m ? `forbidden in diff: ${m[0]}` : 'clean';
      } else if (s.type === 'cmd') {
        const { cmd, cwdKind } = resolveCmd(s.run, repo);
        const r = sh(cmd, { cwd: s.cwd === 'repo' || cwdKind === 'repo' ? wsDir : appRoot, timeoutSec: s.timeoutSec ?? 600, quiet: true });
        ok = r.ok; detail = r.ok ? 'exit 0' : `exit ${r.status}${r.timedOut ? ' (timeout)' : ''}: ${r.output.slice(-1500)}`;
      } else if (s.type === 'hidden-test') {
        if (/--browser|browser\.headless|playwright/i.test(String(s.run ?? ''))) {
          ensurePlaywrightBrowsers(appRoot, repo);
        }
        const dest = path.join(appRoot, s.dest);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(path.join(task.dir, s.src), dest);
        try {
          const r = sh(s.run, { cwd: appRoot, timeoutSec: s.timeoutSec ?? 600, quiet: true });
          ok = r.ok; detail = r.ok ? 'hidden test passed' : r.output.slice(-1500);
        } finally { fs.rmSync(dest, { force: true }); try { fs.rmdirSync(path.dirname(dest)); } catch {} }
      } else if (s.type === 'browser') {
        ok = await browserCheck(s, { appRoot, wsDir, repo }); detail = ok ? 'no matching console errors' : 'console errors matched';
      } else throw new Error(`unknown step type ${s.type}`);
    } catch (err) { ok = false; detail = String(err?.message ?? err); }
    steps.push({ type: s.type, ok, detail });
  }
  return { success: steps.every((x) => x.ok), steps };
}

/** Optional runtime check: start dev server, open URL with Playwright, fail if console matches. Requires `playwright` resolvable from benchmark/. */
async function browserCheck(s, { appRoot, wsDir, repo }) {
  const { chromium } = await import('playwright');
  const { cmd, cwdKind } = resolveCmd(s.start, repo);
  const base = (repo.commands.devUrl ?? 'http://localhost:3000').replace(/\/$/, '');
  const proc = spawn('bash', ['-lc', cmd], { cwd: cwdKind === 'repo' ? wsDir : appRoot, detached: true, stdio: 'ignore', env: { ...process.env, BROWSER: 'none' } });
  try {
    for (let i = 0; i < 120; i++) { try { await fetch(base); break; } catch { await new Promise((r) => setTimeout(r, 1000)); } }
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const bad = []; const re = new RegExp(s.failOnConsole, 'i');
    page.on('console', (m) => { if (re.test(m.text())) bad.push(m.text()); });
    page.on('pageerror', (e) => { if (re.test(String(e))) bad.push(String(e)); });
    await page.goto(base + (s.url ?? '/'), { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await browser.close();
    return bad.length === 0;
  } finally { try { process.kill(-proc.pid); } catch {} }
}
