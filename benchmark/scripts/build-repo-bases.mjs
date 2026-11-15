#!/usr/bin/env node
/**
 * Build (or reuse) one Docker base image per pinned benchmark repo.
 *
 * Image tag: agentic-react/base-<repoId>:<cacheKey>
 * cacheKey = sha256(Dockerfile + repo.sha + lockfiles)[0:12]
 *
 *   node scripts/build-repo-bases.mjs [--filter <repoId>] [--force]
 */
import fs from 'node:fs';
import path from 'node:path';
import { BENCH } from '../lib/task-kit.mjs';
import { buildRepoBase, reposWithTasks, writeRepoBase } from './harbor-images.mjs';

const args = process.argv.slice(2);
const arg = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const filter = arg('filter', '');
const force = args.includes('--force');
const concurrency = Math.max(1, Number(arg('concurrency', '2')));

const repos = reposWithTasks().filter((r) => !filter || r.id.includes(filter));
for (const repo of repos) writeRepoBase(repo); // refresh Dockerfile / image-ref.txt

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

const results = await pool(repos, concurrency, (repo) =>
  Promise.resolve().then(() => buildRepoBase(repo, { force })),
);

const summaryPath = path.join(BENCH, 'experiments', 'repo-base-builds.json');
fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
fs.writeFileSync(
  summaryPath,
  JSON.stringify({ generatedAt: new Date().toISOString(), force, results }, null, 2) + '\n',
);

const built = results.filter((r) => r.built).length;
const skipped = results.filter((r) => r.skipped).length;
console.log(
  `repo bases: ${built} built, ${skipped} cached, ${results.length} total → ${path.relative(BENCH, summaryPath)}`,
);
