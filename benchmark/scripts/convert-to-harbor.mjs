#!/usr/bin/env node
/**
 * Convert benchmark/tasks/<repo>/<task>/task.json → Harbor task packages under
 * vendor/agentic-react-harbor/tasks/<repo>__<task-slug>/.
 *
 * Also writes per-repo base Dockerfiles under vendor/agentic-react-harbor/bases/<repo>/.
 * Task images are thin: FROM agentic-react/base-<repo>:<cacheKey> + setup edits + baseline.
 *
 * Re-run anytime; output is deterministic from task.json + manifest.json.
 *   node scripts/convert-to-harbor.mjs [--filter <substr>] [--out <dir>]
 *   node scripts/build-repo-bases.mjs   # build/cache the FROM bases before harbor run
 */
import fs from 'node:fs';
import path from 'node:path';
import { listTasks, repoById, reverseEdits, BENCH } from '../lib/task-kit.mjs';
import {
  harborSlug,
  runtimeDir,
  taskDockerfile,
  writeRepoBase,
  reposWithTasks,
} from './harbor-images.mjs';

const args = process.argv.slice(2);
const arg = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const filter = arg('filter', args.find((a) => !a.startsWith('--')) ?? '');
const outRoot = path.resolve(BENCH, arg('out', 'vendor/agentic-react-harbor/tasks'));

function solutionEdits(task) {
  if (task.solution === 'reverse-setup') return reverseEdits(task.setup?.edits ?? []);
  if (Array.isArray(task.solution)) return task.solution;
  return null;
}

function taskToml(repo, task) {
  const timeoutMin = task.budget?.timeoutMin ?? 30;
  const agentTimeout = timeoutMin * 60;
  const verifierTimeout = Math.max(900, timeoutMin * 30);
  return `schema_version = "1.4"

[task]
name = "agentic-react/${harborSlug(task.id)}"
version = "1.0.0"
description = ${JSON.stringify(task.prompt.slice(0, 200))}
keywords = ["react", "agentic-react", ${JSON.stringify(task.category)}, ${JSON.stringify(repo.bundler)}]

[metadata]
category = ${JSON.stringify(task.category)}
repo_id = ${JSON.stringify(repo.id)}
source_task_id = ${JSON.stringify(task.id)}
bundler = ${JSON.stringify(repo.bundler)}
framework = ${JSON.stringify(repo.framework)}
source = "converted from benchmark/tasks via scripts/convert-to-harbor.mjs"

[verifier]
timeout_sec = ${verifierTimeout}.0
environment_mode = "shared"

[agent]
timeout_sec = ${agentTimeout}.0

[environment]
build_timeout_sec = 3600.0
cpus = 2
memory_mb = 8192
storage_mb = 40960
gpus = 0
`;
}

function testSh() {
  return `#!/bin/bash
# Harbor verifier entrypoint — grades via check.steps (same semantics as lib/task-kit.mjs).
set -uo pipefail
mkdir -p /logs/verifier
echo 0 > /logs/verifier/reward.txt
echo 0 > /logs/verifier/reward.json 2>/dev/null || true

cd /app || { echo "missing /app"; exit 6; }

if node /tests/check-runner.mjs /tests/task-check.json; then
  echo 1 > /logs/verifier/reward.txt
  printf '{"reward":1}\\n' > /logs/verifier/reward.json
  exit 0
fi

printf '{"reward":0}\\n' > /logs/verifier/reward.json
exit 0
`;
}

function solveSh(hasSolution) {
  if (!hasSolution) {
    return `#!/bin/bash
set -euo pipefail
echo "No reference solution for this task (oracle not provided)." >&2
exit 1
`;
  }
  return `#!/bin/bash
set -euo pipefail
cd /app
APP_DIR="\${BENCH_APP_DIR:-.}"
node /solution/apply-edits.mjs "/app/\${APP_DIR}" /solution/solution-edits.json
git add -A
git -c user.email=oracle@local -c user.name=oracle commit -qm "oracle solution" --allow-empty --no-verify || true
`;
}

// Refresh all repo bases first (so task Dockerfiles get the right FROM tag).
const baseByRepo = new Map();
for (const repo of reposWithTasks()) {
  if (filter && !repo.id.includes(filter) && !listTasks(filter).some((t) => t.repo === repo.id)) {
    continue;
  }
  const meta = writeRepoBase(repo);
  baseByRepo.set(repo.id, meta);
  console.log(`base ${repo.id} → ${meta.ref}`);
}

fs.mkdirSync(outRoot, { recursive: true });
let n = 0;
const skipped = [];

for (const task of listTasks(filter)) {
  const repo = repoById(task.repo);
  const slug = harborSlug(task.id);
  const dest = path.join(outRoot, slug);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(path.join(dest, 'environment'), { recursive: true });
  fs.mkdirSync(path.join(dest, 'tests'), { recursive: true });
  fs.mkdirSync(path.join(dest, 'solution'), { recursive: true });

  const sol = solutionEdits(task);
  const setupEdits = task.setup?.edits ?? [];
  let baseMeta = baseByRepo.get(repo.id);
  if (!baseMeta) {
    baseMeta = writeRepoBase(repo);
    baseByRepo.set(repo.id, baseMeta);
  }

  fs.writeFileSync(path.join(dest, 'task.toml'), taskToml(repo, task));
  fs.writeFileSync(path.join(dest, 'instruction.md'), task.prompt.trim() + '\n');
  fs.writeFileSync(
    path.join(dest, 'environment', 'Dockerfile'),
    taskDockerfile(repo, task, baseMeta.ref),
  );
  fs.copyFileSync(path.join(runtimeDir, 'apply-edits.mjs'), path.join(dest, 'environment', 'apply-edits.mjs'));
  fs.writeFileSync(path.join(dest, 'environment', 'setup-edits.json'), JSON.stringify(setupEdits, null, 2) + '\n');
  fs.writeFileSync(path.join(dest, 'environment', 'base-image-ref.txt'), baseMeta.ref + '\n');

  fs.writeFileSync(path.join(dest, 'tests', 'test.sh'), testSh(), { mode: 0o755 });
  fs.chmodSync(path.join(dest, 'tests', 'test.sh'), 0o755);
  fs.copyFileSync(path.join(runtimeDir, 'check-runner.mjs'), path.join(dest, 'tests', 'check-runner.mjs'));

  const hiddenDir = path.join(task.dir, 'hidden');
  let hasHidden = false;
  if (fs.existsSync(hiddenDir)) {
    fs.cpSync(hiddenDir, path.join(dest, 'tests', 'hidden'), { recursive: true });
    hasHidden = true;
  }

  const taskCheck = {
    appDir: repo.appDir ?? '.',
    commands: repo.commands ?? {},
    commandsCwd: repo.commandsCwd,
    check: task.check ?? { steps: [] },
    hiddenBase: hasHidden ? '/tests/hidden' : undefined,
  };
  fs.writeFileSync(path.join(dest, 'tests', 'task-check.json'), JSON.stringify(taskCheck, null, 2) + '\n');

  fs.copyFileSync(path.join(runtimeDir, 'apply-edits.mjs'), path.join(dest, 'solution', 'apply-edits.mjs'));
  fs.writeFileSync(path.join(dest, 'solution', 'solve.sh'), solveSh(!!sol), { mode: 0o755 });
  fs.chmodSync(path.join(dest, 'solution', 'solve.sh'), 0o755);
  fs.writeFileSync(
    path.join(dest, 'solution', 'solution-edits.json'),
    JSON.stringify(sol ?? [], null, 2) + '\n',
  );
  if (!sol) skipped.push(`${task.id}: no oracle solution`);

  n++;
  console.log(`wrote ${path.relative(BENCH, dest)}`);
}

const listDir = path.join(BENCH, 'suites/agentic-react');
fs.mkdirSync(listDir, { recursive: true });
const slugs = fs
  .readdirSync(outRoot)
  .filter((d) => fs.existsSync(path.join(outRoot, d, 'task.toml')))
  .sort();
fs.writeFileSync(path.join(listDir, 'tasks.txt'), slugs.join('\n') + '\n');
fs.writeFileSync(
  path.join(listDir, 'README.md'),
  `# agentic-react Harbor suite\n\nGenerated task list for primase (\`suites.json\`).\n\nRegenerate:\n\n\`\`\`bash\nnode scripts/convert-to-harbor.mjs\nnode scripts/build-repo-bases.mjs\nnode scripts/prepare-variants.mjs\n\`\`\`\n`,
);

console.log(`\nconverted ${n} Harbor tasks → ${path.relative(BENCH, outRoot)}`);
console.log(`wrote suites/agentic-react/tasks.txt (${slugs.length} tasks)`);
console.log(`repo bases: ${baseByRepo.size} under vendor/agentic-react-harbor/bases/`);
if (skipped.length) {
  console.log('oracle gaps:');
  for (const s of skipped) console.log(`  - ${s}`);
}
