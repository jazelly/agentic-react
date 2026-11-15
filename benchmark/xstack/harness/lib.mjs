// Cross-stack benchmark harness: shared helpers (zero deps, Node >= 22).
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const XS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const WORK = process.env.XS_WORK ?? path.join(XS, 'work');
export const STACKS_DIR = path.join(XS, 'stacks');
export const TASK_ROOTS = [path.join(XS, 'tasks'), path.join(XS, 'private', 'tasks')];
export const VERIFIER = path.join(XS, 'verifier');
export const RESULTS = path.join(XS, 'results');
export const STACK_IDS = ['vite-spa', 'webpack5', 'rsbuild', 'next-turbopack', 'tanstack-start', 'astro', 'react-router-7'];
// removed 2026-11-13 (Jason): next-webpack (overlaps next-turbopack; same framework, other bundler). Definition archived in stacks-archived/.
export const PW_BROWSERS = process.env.PLAYWRIGHT_BROWSERS_PATH ?? path.join(WORK, 'ms-playwright');

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
export const loadStack = (id) => readJson(path.join(STACKS_DIR, id, 'stack.json'));

export function listTasks(filter) {
  const out = [];
  for (const root of TASK_ROOTS) {
    if (!fs.existsSync(root)) continue;
    for (const d of fs.readdirSync(root).sort()) {
      const p = path.join(root, d, 'task.json');
      if (!fs.existsSync(p)) continue;
      const t = readJson(p);
      t.dir = path.join(root, d);
      if (!filter || t.id === filter || t.id.startsWith(filter) || (t.tags ?? []).includes(filter)) out.push(t);
    }
  }
  return out;
}

/** status of a task on a stack: {status: 'applicable'|'na', reason?, variant?} */
export function stackStatus(task, stackId) {
  const o = task.stacks?.[stackId];
  if (o) return o;
  return { status: task.stacks?.default ?? 'applicable' };
}

export function sh(cmd, { cwd, env = {}, timeoutSec = 900, quiet = true } = {}) {
  const r = spawnSync('bash', ['-c', cmd], { cwd, env: { ...process.env, ...env }, encoding: 'utf8', timeout: timeoutSec * 1000, maxBuffer: 256 * 1024 * 1024 });
  const output = (r.stdout ?? '') + (r.stderr ?? '');
  if (!quiet) process.stdout.write(output);
  return { ok: r.status === 0, status: r.status, output, timedOut: r.error?.code === 'ETIMEDOUT' };
}

export function rmrf(p) { fs.rmSync(p, { recursive: true, force: true }); }

/** Copy-on-write clone (APFS clonefile on macOS, reflink on Linux). */
export function cowCopy(src, dst) {
  rmrf(dst);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  const cmd = process.platform === 'darwin' ? `cp -cR "${src}" "${dst}"` : `cp -a --reflink=auto "${src}" "${dst}"`;
  const r = sh(cmd);
  if (!r.ok) throw new Error(`copy failed: ${r.output}`);
}

export function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  fs.cpSync(src, dst, { recursive: true });
}

export function applyEdits(root, edits = []) {
  for (const e of edits) {
    const f = path.join(root, e.file);
    const src = fs.readFileSync(f, 'utf8');
    const n = src.split(e.find).length - 1;
    if (n !== 1) throw new Error(`edit must match once (matched ${n}x) in ${e.file}: ${JSON.stringify(e.find).slice(0, 80)}`);
    fs.writeFileSync(f, src.replace(e.find, e.replace));
  }
}

export const freePort = () => new Promise((res, rej) => {
  const s = net.createServer();
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); });
  s.on('error', rej);
});

/** Installed stack variant dir (node_modules present). variant: base | agentic */
export const stackInstallDir = (stackId, variant) => path.join(WORK, 'stacks', stackId, variant);

export function stackHasAgentic(stack) { return !!stack.agentic; }

/** Materialize task x stack into dir. Returns {dir, stack, variant, overlayFiles}. */
export function materialize(task, stackId, dir, { variant = 'base', state = 'initial' } = {}) {
  const stack = loadStack(stackId);
  const v = variant === 'agentic' && stack.agentic ? 'agentic' : 'base';
  const inst = stackInstallDir(stackId, v);
  if (!fs.existsSync(path.join(inst, 'node_modules'))) throw new Error(`stack ${stackId}/${v} not installed; run: node harness/install-stacks.mjs ${stackId}`);
  cowCopy(inst, dir);
  // the task's stack-agnostic app source goes into src/ui (template placeholder App.tsx is replaced)
  const ui = path.join(dir, stack.taskDir ?? 'src/ui');
  rmrf(ui);
  copyDir(path.join(task.dir, task.app ?? 'app'), ui);
  const sv = stackStatus(task, stackId);
  if (sv.variantDir) copyDir(path.join(task.dir, sv.variantDir), dir); // per-stack porting variant (files relative to project root)
  if (state === 'solution') applySolution(task, stackId, dir);
  fs.writeFileSync(path.join(dir, '.gitignore'), fs.readFileSync(path.join(dir, '.gitignore'), 'utf8') + '.bench-verify\n');
  const g = 'git -c user.email=bench@local -c user.name=bench -c commit.gpgsign=false';
  const r = sh(`git init -q && ${g} add -A && ${g} commit -qm baseline --no-verify`, { cwd: dir });
  if (!r.ok) throw new Error(`git baseline failed: ${r.output}`);
  return { dir, stack, variant: v, overlayFiles: v === 'agentic' ? (stack.agentic.edits ?? []).map((e) => e.file).concat(['package.json']) : [] };
}

export function applySolution(task, stackId, dir) {
  const stack = loadStack(stackId);
  const ui = path.join(dir, stack.taskDir ?? 'src/ui');
  if (task.solution) copyDir(path.join(task.dir, task.solution), ui);
  const sv = stackStatus(task, stackId);
  if (sv.solutionVariantDir) copyDir(path.join(task.dir, sv.solutionVariantDir), dir);
}

function substitute(cmd, vars) { return cmd.replace(/\$PORT/g, String(vars.PORT)); }

export function startServer(cmd, { cwd, port, logFile, env = {} }) {
  const out = fs.openSync(logFile, 'a');
  let full;
  if (cmd.startsWith('@static ')) full = `node "${path.join(XS, 'harness', 'static-server.mjs')}" "${cmd.slice(8).trim()}" ${port}`;
  else full = `PATH="$PWD/node_modules/.bin:$PATH" ${substitute(cmd, { PORT: port })}`;
  const child = spawn('bash', ['-c', full], { cwd, detached: true, stdio: ['ignore', out, out], env: { ...process.env, PORT: String(port), BROWSER: 'none', NEXT_TELEMETRY_DISABLED: '1', ASTRO_TELEMETRY_DISABLED: '1', ...env } });
  return { child, stop: () => { try { process.kill(-child.pid, 'SIGTERM'); } catch {} ; setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 3000).unref(); } };
}

export async function waitHttp(url, timeoutMs = 180_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try { const r = await fetch(url, { redirect: 'manual' }); if (r.status < 500) return true; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

export const binPath = (dir) => `PATH="${dir}/node_modules/.bin:$PATH"`;

/**
 * Hidden verification on a materialized workspace. Stack-agnostic:
 *  - component: Vitest + jsdom + Testing Library specs copied into .bench-verify/ (run with the workspace's vitest)
 *  - e2e: production build + start, then Playwright specs from verifier/ against the running server
 */
export async function verify(task, stackId, dir, { logDir, keepServer = false } = {}) {
  const stack = loadStack(stackId);
  fs.mkdirSync(logDir, { recursive: true });
  const steps = [];
  const v = task.verify ?? {};
  const vdir = path.join(dir, '.bench-verify');
  rmrf(vdir);
  fs.mkdirSync(vdir, { recursive: true });
  try {
    if (v.component?.length) {
      for (const f of v.component) fs.copyFileSync(path.join(task.dir, f), path.join(vdir, path.basename(f)));
      if (v.componentSetup) fs.copyFileSync(path.join(task.dir, v.componentSetup), path.join(vdir, 'setup.' + path.basename(v.componentSetup).split('.').pop()));
      fs.writeFileSync(path.join(vdir, 'harness-setup.ts'), "import { cleanup } from '@testing-library/react'\nimport { afterEach } from 'vitest'\nafterEach(() => cleanup())\n");
      const aliases = Object.entries(v.componentAliases ?? {}).map(([k, val]) => `{ find: ${JSON.stringify(k)}, replacement: path.resolve(root, ${JSON.stringify(val)}) }`).join(',\n      ');
      fs.writeFileSync(path.join(vdir, 'vitest.config.mts'), `
import path from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
const root = path.resolve(import.meta.dirname, '..')
export default defineConfig({
  root,
  plugins: [react()],
  resolve: { alias: [
      ${aliases}
    ], dedupe: ['react', 'react-dom'] },
  test: { environment: 'jsdom', include: ['.bench-verify/**/*.{test,spec}.{ts,tsx,js,jsx}'], setupFiles: ['.bench-verify/harness-setup.ts'${v.componentSetup ? ", '.bench-verify/setup." + v.componentSetup.split('.').pop() + "'" : ''}], globals: false, pool: 'forks', fsModuleCache: false, testTimeout: 20000 },
})
`);
      const r = sh(`${binPath(dir)} vitest run --config .bench-verify/vitest.config.mts --reporter=dot`, { cwd: dir, timeoutSec: 600, env: { CI: '1' } });
      fs.writeFileSync(path.join(logDir, 'component.log'), r.output);
      steps.push({ type: 'component', ok: r.ok, detail: tail(r.output) });
    }
    if (v.e2e?.length) {
      const b = sh(`${binPath(dir)} ${stack.build}`, { cwd: dir, timeoutSec: 1200, env: { CI: '1', NEXT_TELEMETRY_DISABLED: '1', ASTRO_TELEMETRY_DISABLED: '1' } });
      fs.writeFileSync(path.join(logDir, 'build.log'), b.output);
      steps.push({ type: 'build', ok: b.ok, detail: tail(b.output) });
      if (b.ok) {
        let port = await freePort();
        let srv = startServer(stack.start, { cwd: dir, port, logFile: path.join(logDir, 'server.log') });
        let up = await waitHttp(`http://127.0.0.1:${port}/`, 120_000);
        if (!up) { // one retry on a fresh port (observed rare port-reuse flake under --concurrency 4)
          srv.stop(); await new Promise((r) => setTimeout(r, 3500));
          fs.appendFileSync(path.join(logDir, 'server.log'), `\n[harness] server not reachable on ${port}; retrying once on a new port\n`);
          port = await freePort();
          srv = startServer(stack.start, { cwd: dir, port, logFile: path.join(logDir, 'server.log') });
          up = await waitHttp(`http://127.0.0.1:${port}/`, 120_000);
        }
        steps.push({ type: 'server', ok: up, detail: up ? `port ${port}` : tail(safeRead(path.join(logDir, 'server.log'))) });
        if (up) {
          // specs must live under verifier/ so '@playwright/test' resolves from the verifier's isolated install
          const specDir = path.join(VERIFIER, '.specs', path.basename(path.dirname(dir)) + '-' + process.pid + '-' + port);
          // specs go to <specDir>/e2e/, optional support files (e.g. upstream '../constants') to <specDir>/
          fs.mkdirSync(path.join(specDir, 'e2e'), { recursive: true });
          for (const f of v.e2e) fs.copyFileSync(path.join(task.dir, f), path.join(specDir, 'e2e', path.basename(f)));
          // e2eSupport entry: 'tests/x.ts' -> <specDir>/x.ts, or { from: 'app/constants.ts', to: 'src/constants.ts' } -> <specDir>/src/constants.ts
          for (const f of v.e2eSupport ?? []) {
            const from = typeof f === 'string' ? f : f.from, to = path.join(specDir, typeof f === 'string' ? path.basename(f) : f.to);
            fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(path.join(task.dir, from), to);
          }
          const cfg = path.join(vdir, 'playwright.config.mjs');
          fs.writeFileSync(cfg, `export default { testDir: ${JSON.stringify(path.join(specDir, 'e2e'))}, timeout: 30000, retries: 0, reporter: 'line', use: { baseURL: 'http://127.0.0.1:${port}' }, projects: [{ name: 'chromium', use: { browserName: 'chromium' } }] }\n`);
          const r = sh(`"${VERIFIER}/node_modules/.bin/playwright" test --config "${cfg}"${v.e2eGrepInvert ? ` --grep-invert ${JSON.stringify(v.e2eGrepInvert)}` : ''}`, { cwd: VERIFIER, timeoutSec: 600, env: { PLAYWRIGHT_BROWSERS_PATH: PW_BROWSERS, CI: '1' } });
          fs.writeFileSync(path.join(logDir, 'e2e.log'), r.output);
          rmrf(specDir);
          steps.push({ type: 'e2e', ok: r.ok, detail: tail(r.output) });
        }
        if (!keepServer) srv.stop();
      }
    }
    if (v.typecheck) {
      // hidden, fixed tsconfig (the workspace's tsconfig.ui.json could be weakened by the agent)
      const tsc = path.join(vdir, 'tsconfig.json');
      fs.writeFileSync(tsc, JSON.stringify({ compilerOptions: { target: 'ES2022', lib: ['DOM', 'DOM.Iterable', 'ES2022'], module: 'ESNext', moduleResolution: 'Bundler', jsx: 'react-jsx', strict: true, skipLibCheck: true, isolatedModules: true, verbatimModuleSyntax: true, noEmit: true, esModuleInterop: true, types: [] }, include: ['../src/ui/**/*'] }));
      const r = sh(`"${dir}/node_modules/.bin/tsc" --noEmit -p "${tsc}"`, { cwd: dir, timeoutSec: 300 });
      fs.writeFileSync(path.join(logDir, 'typecheck.log'), r.output);
      const noTsIgnore = !sh(`grep -rnE "@ts-(ignore|nocheck|expect-error)" src/ui`, { cwd: dir }).ok;
      steps.push({ type: 'typecheck', ok: r.ok && noTsIgnore, detail: (noTsIgnore ? '' : 'ts-ignore found; ') + tail(r.output) });
    }
    for (const c of v.static ?? []) {
      const f = path.join(dir, c.file);
      const txt = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
      const hit = new RegExp(c.pattern, c.flags ?? 'm').test(txt);
      steps.push({ type: 'static', ok: hit === (c.expect ?? true), detail: `${c.file} /${c.pattern}/ expect=${c.expect ?? true}` });
    }
  } finally {
    rmrf(vdir);
  }
  return { success: steps.length > 0 && steps.every((s) => s.ok), steps };
}

const tail = (s, n = 1200) => (s ?? '').slice(-n);
const safeRead = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };
