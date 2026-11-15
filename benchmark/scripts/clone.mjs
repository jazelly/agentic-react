#!/usr/bin/env node
// Recreate pinned shallow clones in repos/<id>/ from manifest.json. Idempotent; never touches anything outside repos/.
import fs from 'node:fs';
import path from 'node:path';
import { manifest, REPOS, sh } from '../lib/task-kit.mjs';

const only = process.argv[2];
fs.mkdirSync(REPOS, { recursive: true });
for (const r of manifest().repos) {
  if (only && r.id !== only) continue;
  const dir = path.join(REPOS, r.id);
  if (fs.existsSync(path.join(dir, '.git'))) {
    const head = sh('git rev-parse HEAD', { cwd: dir, quiet: true }).output.trim();
    console.log(`${head === r.sha ? 'ok     ' : 'DRIFT  '} ${r.id} ${head}${head === r.sha ? '' : ` (manifest ${r.sha})`}`);
    continue;
  }
  const sparse = r.sparse?.length ? '--filter=blob:none --sparse' : '';
  const steps = [
    `git init -q "${dir}"`,
    `git -C "${dir}" remote add origin ${r.repo}.git`,
    sparse && `git -C "${dir}" sparse-checkout set ${r.sparse.join(' ')}`,
    `git -C "${dir}" fetch -q --depth 1 ${sparse.replace('--sparse', '')} origin ${r.sha}`,
    `git -C "${dir}" checkout -q FETCH_HEAD`,
  ].filter(Boolean);
  const res = sh(steps.join(' && '), { timeoutSec: 900 });
  console.log(`${res.ok ? 'cloned ' : 'FAILED '} ${r.id} @ ${r.sha}`);
}
