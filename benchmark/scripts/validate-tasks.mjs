#!/usr/bin/env node
// Static validation (default): every setup/solution edit matches the pinned clone, check steps are well-formed.
// --oracle <filter>: full oracle run in a scratch workspace: setup -> checks must FAIL (bug tasks) -> solution -> checks must PASS.
//   Requires the repo to be installed (node_modules in repos/<id>/ or appDir).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { listTasks, repoById, REPOS, applyEdits, reverseEdits, prepareWorkspace, runChecks, RUNS } from '../lib/task-kit.mjs';

const args = process.argv.slice(2);
const oracle = args.includes('--oracle');
const filter = args.filter((a) => !a.startsWith('--'))[0] ?? '';
let bad = 0;

for (const task of listTasks(filter)) {
  const repo = repoById(task.repo);
  const appRoot = path.join(REPOS, repo.id, repo.appDir ?? '.');
  const problems = [];
  try { applyEdits(appRoot, task.setup?.edits, { dryRun: true }); } catch (e) { problems.push(`setup: ${e.message}`); }
  if (Array.isArray(task.solution)) {
    // solution edits apply to the post-setup tree; validate against a temp copy of only the touched files
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'arb-'));
    try {
      for (const f of new Set([...(task.setup?.edits ?? []), ...task.solution].map((e) => e.file))) {
        fs.mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true });
        fs.copyFileSync(path.join(appRoot, f), path.join(tmp, f));
      }
      applyEdits(tmp, task.setup?.edits);
      applyEdits(tmp, task.solution);
    } catch (e) { problems.push(`solution: ${e.message}`); } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
  for (const s of task.check?.steps ?? []) {
    if (s.file && !fs.existsSync(path.join(appRoot, s.file))) problems.push(`check file missing: ${s.file}`);
    if (s.type === 'hidden-test' && !fs.existsSync(path.join(task.dir, s.src))) problems.push(`hidden test missing: ${s.src}`);
    if (typeof s.run === 'string' && s.run.startsWith('@') && !repo.commands?.[s.run.slice(1)]) problems.push(`manifest lacks commands.${s.run.slice(1)}`);
  }
  if (problems.length) bad++;
  console.log(`${problems.length ? 'FAIL' : 'ok  '} ${task.id} [${task.category}]${problems.length ? '\n     ' + problems.join('\n     ') : ''}`);

  if (oracle && !problems.length) {
    const ws = prepareWorkspace(task, path.join(RUNS, '_oracle', task.id.replace('/', '__')));
    const before = await runChecks(task, ws);
    const sol = task.solution === 'reverse-setup' ? reverseEdits(task.setup.edits) : Array.isArray(task.solution) ? task.solution : null;
    if (!sol) { console.log('     oracle: no solution provided, skipped'); fs.rmSync(ws.wsDir, { recursive: true, force: true }); continue; }
    applyEdits(ws.appRoot, sol);
    const after = await runChecks(task, ws);
    const expectFailBefore = (task.setup?.edits ?? []).length > 0 || task.category === 'ui-locate-edit';
    const okOracle = after.success && (!expectFailBefore || !before.success);
    if (!okOracle) bad++;
    console.log(`     oracle: before=${before.success ? 'PASS' : 'fail'} after=${after.success ? 'PASS' : 'FAIL'} ${okOracle ? 'ok' : 'BAD'}`);
    if (!after.success) for (const s of after.steps.filter((x) => !x.ok)) console.log(`       - ${s.type}: ${s.detail.slice(0, 300)}`);
    if (!process.env.ARB_KEEP_WS) fs.rmSync(ws.wsDir, { recursive: true, force: true }); // ARB_KEEP_WS=1 to inspect
  }
}
process.exit(bad ? 1 : 0);
