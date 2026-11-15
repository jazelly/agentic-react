#!/usr/bin/env node
/**
 * Harbor verifier: run check.steps with the same semantics as lib/task-kit.mjs#runChecks.
 * Usage: node check-runner.mjs <task-check.json>
 *
 * task-check.json shape:
 *   { appDir, commands, commandsCwd?, check: { steps }, hiddenBase?: "/tests/hidden" }
 *
 * Workspace root is /app (Harbor convention). Writes step details to stdout;
 * exit 0 = all required steps passed, exit 1 = failure.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, spawn } from 'node:child_process';

const checkPath = process.argv[2];
if (!checkPath) {
  console.error('usage: check-runner.mjs <task-check.json>');
  process.exit(2);
}

const meta = JSON.parse(fs.readFileSync(checkPath, 'utf8'));
const wsDir = process.env.BENCH_WS_DIR || '/app';
const appRoot = path.join(wsDir, meta.appDir && meta.appDir !== '.' ? meta.appDir : '.');
const includeOptional = process.env.BENCH_INCLUDE_OPTIONAL === '1';

function sh(cmd, { cwd, timeoutSec = 600 } = {}) {
  const r = spawnSync('bash', ['-lc', cmd], {
    cwd,
    env: { ...process.env, CI: '1' },
    encoding: 'utf8',
    timeout: timeoutSec * 1000,
    maxBuffer: 256 * 1024 * 1024,
  });
  return {
    ok: r.status === 0,
    status: r.status,
    output: `${r.stdout ?? ''}${r.stderr ?? ''}`,
    timedOut: r.error?.code === 'ETIMEDOUT',
  };
}

const globToRe = (g) =>
  new RegExp(
    '^' +
      g
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*\//g, '(?:.*/)?')
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*') +
      '$',
  );

const walk = (dir, base = dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    if (d.name === 'node_modules' || d.name.startsWith('.')) return [];
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p, base) : [path.relative(base, p)];
  });

function changedFiles() {
  const r = sh('git status --porcelain --untracked-files=all', { cwd: wsDir });
  return r.output
    .split('\n')
    .filter(Boolean)
    .map((l) => l.slice(3).replace(/^.* -> /, ''));
}

/** Paths that tooling rewrites during @build/@typecheck; not agent edits. */
function isIgnorableChangedPath(f) {
  return (
    /(^|\/)(node_modules|\.next|dist|build|\.astro|\.turbo|\.vite|\.react-router|test-results)\//.test(f) ||
    /(^|\/)next-env\.d\.ts$/.test(f) ||
    /(^|\/)tsconfig\.tsbuildinfo$/.test(f)
  );
}

function resolveCmd(run) {
  if (!run.startsWith('@')) return { cmd: run, cwdKind: 'app' };
  const key = run.slice(1);
  const cmd = meta.commands?.[key];
  if (!cmd) throw new Error(`manifest has no commands.${key}`);
  return { cmd, cwdKind: meta.commandsCwd === 'appDir' ? 'app' : 'repo' };
}

async function browserCheck(s) {
  // Optional; requires playwright in the image. Skip hard-fail if missing.
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.log('browser: playwright not available, treating as skipped');
    return true;
  }
  const { cmd, cwdKind } = resolveCmd(s.start);
  const base = (meta.commands?.devUrl ?? 'http://localhost:3000').replace(/\/$/, '');
  const proc = spawn('bash', ['-lc', cmd], {
    cwd: cwdKind === 'repo' ? wsDir : appRoot,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, BROWSER: 'none' },
  });
  try {
    for (let i = 0; i < 120; i++) {
      try {
        await fetch(base);
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const bad = [];
    const re = new RegExp(s.failOnConsole, 'i');
    page.on('console', (m) => {
      if (re.test(m.text())) bad.push(m.text());
    });
    page.on('pageerror', (e) => {
      if (re.test(String(e))) bad.push(String(e));
    });
    await page.goto(base + (s.url ?? '/'), { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await browser.close();
    return bad.length === 0;
  } finally {
    try {
      process.kill(-proc.pid);
    } catch {
      /* ignore */
    }
  }
}

const steps = [];
for (const s of meta.check?.steps ?? []) {
  if (s.optional && !includeOptional) {
    steps.push({ type: s.type, ok: true, skipped: true, detail: 'optional skipped' });
    continue;
  }
  let ok = false;
  let detail = '';
  try {
    if (s.type === 'regex') {
      const files = s.file
        ? [s.file]
        : walk(appRoot).filter((f) => s.files.some((g) => globToRe(g).test(f)));
      const re = new RegExp(s.pattern, s.flags ?? 'm');
      const hit = files.filter(
        (f) => fs.existsSync(path.join(appRoot, f)) && re.test(fs.readFileSync(path.join(appRoot, f), 'utf8')),
      );
      ok = s.expect ? hit.length > 0 : hit.length === 0;
      detail = `${s.expect ? 'expected' : 'forbidden'} /${s.pattern}/ hits=${hit.join(',') || 0}`;
    } else if (s.type === 'only-changed') {
      const prefix =
        meta.appDir && meta.appDir !== '.' ? meta.appDir.replace(/\/$/, '') + '/' : '';
      // Ignore build/tooling noise (Next rewrites next-env.d.ts on build/typecheck).
      const changed = changedFiles().filter((f) => !isIgnorableChangedPath(f));
      const extra = changed.filter(
        (f) => !(f.startsWith(prefix) && s.allow.some((g) => globToRe(g).test(f.slice(prefix.length)))),
      );
      ok = extra.length === 0;
      detail = extra.length ? `unexpected changes: ${extra.join(', ')}` : `changed: ${changed.join(', ')}`;
    } else if (s.type === 'forbid') {
      const diff = sh('git diff -U0 HEAD', { cwd: wsDir })
        .output.split('\n')
        .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
        .join('\n');
      const m = diff.match(new RegExp(s.pattern));
      ok = !m;
      detail = m ? `forbidden in diff: ${m[0]}` : 'clean';
    } else if (s.type === 'cmd') {
      const { cmd, cwdKind } = resolveCmd(s.run);
      const r = sh(cmd, {
        cwd: s.cwd === 'repo' || cwdKind === 'repo' ? wsDir : appRoot,
        timeoutSec: s.timeoutSec ?? 600,
      });
      ok = r.ok;
      detail = r.ok
        ? 'exit 0'
        : `exit ${r.status}${r.timedOut ? ' (timeout)' : ''}: ${r.output.slice(-1500)}`;
    } else if (s.type === 'hidden-test') {
      if (/--browser|browser\.headless|playwright/i.test(String(s.run ?? ''))) {
        // Fallback if the image skipped browser install somehow.
        const hasChromium = sh(
          'ls "$HOME/.cache/ms-playwright" 2>/dev/null | grep -qi chromium',
          { cwd: appRoot, timeoutSec: 30 },
        ).ok;
        if (!hasChromium) {
          console.log('playwright chromium missing — installing…');
          const inst = sh(
            'if [ -x node_modules/.bin/playwright ]; then ./node_modules/.bin/playwright install chromium --with-deps; ' +
              'elif pnpm exec playwright --version >/dev/null 2>&1; then pnpm exec playwright install chromium --with-deps; ' +
              'else npx --yes playwright@1.59.1 install chromium --with-deps; fi',
            { cwd: appRoot, timeoutSec: 600 },
          );
          if (!inst.ok) {
            ok = false;
            detail = `playwright install failed: ${inst.output.slice(-800)}`;
            steps.push({ type: s.type, ok, detail });
            console.log(`FAIL ${s.type}: ${detail.slice(0, 500)}`);
            continue;
          }
        }
      }
      const hiddenBase = meta.hiddenBase || '/tests/hidden';
      const src = path.join(hiddenBase, path.basename(s.src));
      // Prefer exact relative path under hidden/ when nested
      const srcAlt = path.join(hiddenBase, s.src.replace(/^hidden\//, ''));
      const srcFile = fs.existsSync(srcAlt) ? srcAlt : src;
      const dest = path.join(appRoot, s.dest);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(srcFile, dest);
      try {
        const r = sh(s.run, { cwd: appRoot, timeoutSec: s.timeoutSec ?? 600 });
        ok = r.ok;
        detail = r.ok ? 'hidden test passed' : r.output.slice(-1500);
      } finally {
        fs.rmSync(dest, { force: true });
        try {
          fs.rmdirSync(path.dirname(dest));
        } catch {
          /* ignore */
        }
      }
    } else if (s.type === 'browser') {
      ok = await browserCheck(s);
      detail = ok ? 'no matching console errors' : 'console errors matched';
    } else {
      throw new Error(`unknown step type ${s.type}`);
    }
  } catch (err) {
    ok = false;
    detail = String(err?.message ?? err);
  }
  steps.push({ type: s.type, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${s.type}: ${detail.slice(0, 500)}`);
}

const success = steps.every((x) => x.ok);
const outDir = process.env.BENCH_VERIFIER_DIR || '/logs/verifier';
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'check-steps.json'), JSON.stringify({ success, steps }, null, 2));
process.exit(success ? 0 : 1);
