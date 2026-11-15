#!/usr/bin/env node
/**
 * Run Harbor oracle on control (all tasks) and agentic (overlay-supported only).
 * Usage:
 *   node scripts/run-oracle-batch.mjs [--variant control|agentic|both] [--filter substr] [--concurrency N]
 *
 * Writes jobs/oracle-<variant>/ and a CSV summary under experiments/oracle-rewards.csv
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BENCH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const variantsRoot = path.join(BENCH, 'work/variants/agentic-react');
/** Repos with a real arms/agentic overlay (others still have agentic≡control trees). */
const OVERLAY_REPOS = new Set([
  'vite-shadcn-admin',
  'next-webpack-jsoncrack',
  'tanstack-start-trellaux',
  'rr7-epic-stack',
]);

const args = process.argv.slice(2);
const arg = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const variantSel = arg('variant', 'both');
const filter = arg('filter', '');
const concurrency = Number(arg('concurrency', '2'));
// Default: all 32 agentic trees (overlay or agentic≡control). Pass --overlay-only to skip ≡control.
const overlayOnly = args.includes('--overlay-only');
const harborBin = path.join(BENCH, '.venv/bin/harbor');

function listTasks(variant) {
  const dir = path.join(variantsRoot, variant);
  return fs
    .readdirSync(dir)
    .filter((d) => fs.existsSync(path.join(dir, d, 'task.toml')))
    .filter((d) => !filter || d.includes(filter))
    .filter((d) => {
      if (variant !== 'agentic' || !overlayOnly) return true;
      const repo = d.split('__')[0];
      return OVERLAY_REPOS.has(repo);
    })
    .sort();
}

function readReward(jobDir) {
  // Harbor writes under jobs/<job>/.../verifier/reward.txt — search recursively
  const stack = [jobDir];
  while (stack.length) {
    const cur = stack.pop();
    if (!fs.existsSync(cur)) continue;
    for (const name of fs.readdirSync(cur)) {
      const p = path.join(cur, name);
      let st;
      try {
        st = fs.statSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory()) stack.push(p);
      else if (name === 'reward.txt') {
        const v = fs.readFileSync(p, 'utf8').trim();
        return Number(v);
      }
    }
  }
  return null;
}

function runOne(variant, slug) {
  const taskPath = path.join(variantsRoot, variant, slug);
  const out = path.join(BENCH, 'jobs', `oracle-${variant}`, slug);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  console.log(`[${variant}] START ${slug}`);
  const r = spawnSync(
    harborBin,
    ['run', '-a', 'oracle', '-p', taskPath, '-o', out, '-y', '-n', '1'],
    { cwd: BENCH, encoding: 'utf8', env: process.env, timeout: 3 * 60 * 60 * 1000 },
  );
  const reward = readReward(out);
  const ok = reward === 1;
  console.log(
    `[${variant}] ${ok ? 'PASS' : 'FAIL'} ${slug} reward=${reward} status=${r.status}${r.error ? ' err=' + r.error.message : ''}`,
  );
  if (!ok) {
    const tail = `${r.stdout ?? ''}${r.stderr ?? ''}`.slice(-2000);
    if (tail) console.log(tail);
  }
  return { variant, slug, reward, status: r.status, ok };
}

async function runPool(items, worker) {
  const results = [];
  let i = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx]);
    }
  });
  await Promise.all(runners);
  return results;
}

const variants = [];
if (variantSel === 'both' || variantSel === 'control') variants.push('control');
if (variantSel === 'both' || variantSel === 'agentic') variants.push('agentic');

const jobs = [];
for (const v of variants) {
  for (const slug of listTasks(v)) jobs.push({ variant: v, slug });
}

console.log(`oracle batch: ${jobs.length} trials, concurrency=${concurrency}`);
const results = await runPool(jobs, ({ variant, slug }) =>
  Promise.resolve().then(() => runOne(variant, slug)),
);

const summaryPath = path.join(BENCH, 'experiments', 'oracle-rewards.csv');
fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
const lines = ['variant,task,reward,ok'];
for (const r of results) lines.push(`${r.variant},${r.slug},${r.reward ?? ''},${r.ok ? 1 : 0}`);
fs.writeFileSync(summaryPath, lines.join('\n') + '\n');
console.log(`wrote ${summaryPath}`);
const failed = results.filter((r) => !r.ok);
console.log(`done: ${results.length - failed.length}/${results.length} reward=1`);
if (failed.length) {
  console.log('failures:');
  for (const f of failed) console.log(`  ${f.variant}/${f.slug} reward=${f.reward}`);
  process.exit(1);
}
