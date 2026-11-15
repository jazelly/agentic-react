#!/usr/bin/env node
/**
 * Build control / agentic Harbor task trees:
 *   work/variants/agentic-react/control/<task>  = converted Harbor task (stock)
 *   work/variants/agentic-react/agentic/<task>  = same + arms/agentic overlay when available
 *
 * Agentic arm (when arms/agentic/<repo>.json exists) is a thin layer on the task image:
 *   - installs @agentic-react/<adapter>@pinned during image build
 *   - applies overlay edits before the bench-baseline commit
 *   - appends AGENTS.snippet.md into the workspace
 * Repo clone/deps/playwright live in the shared base image (see build-repo-bases.mjs).
 *
 * Usage:
 *   node scripts/prepare-variants.mjs [--filter <substr>] [--out work/variants] [--skip-bases]
 *   node scripts/convert-to-harbor.mjs   # run first (or this script runs it)
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { BENCH, manifest, repoById } from '../lib/task-kit.mjs';

const args = process.argv.slice(2);
const arg = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const filter = arg('filter', '');
const outRoot = path.resolve(BENCH, arg('out', 'work/variants/agentic-react'));
const vendorTasks = path.join(BENCH, 'vendor/agentic-react-harbor/tasks');
const armsDir = path.join(BENCH, 'arms/agentic');
const snippetPath = path.join(armsDir, 'AGENTS.snippet.md');
const skipBases = args.includes('--skip-bases');

// Ensure Harbor tasks exist
if (!fs.existsSync(vendorTasks) || fs.readdirSync(vendorTasks).length === 0) {
  console.log('vendor tasks missing — running convert-to-harbor.mjs…');
  const r = spawnSync(process.execPath, [path.join(BENCH, 'scripts/convert-to-harbor.mjs')], {
    cwd: BENCH,
    stdio: 'inherit',
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

// Build/cache shared per-repo base images so task FROM lines resolve locally.
if (!skipBases) {
  console.log('building/caching repo base images…');
  const baseArgs = [path.join(BENCH, 'scripts/build-repo-bases.mjs')];
  if (filter) baseArgs.push('--filter', filter.split('__')[0]);
  const br = spawnSync(process.execPath, baseArgs, { cwd: BENCH, stdio: 'inherit' });
  if (br.status !== 0) process.exit(br.status ?? 1);
}

const overlayStatus = {
  supported: [],
  unsupported: [],
};

function loadOverlay(repoId) {
  const p = path.join(armsDir, `${repoId}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function insertBeforeBaseline(dockerfile, lines) {
  const marker = '# Scratch baseline:';
  const idx = dockerfile.indexOf(marker);
  if (idx < 0) throw new Error('Dockerfile missing baseline marker');
  return dockerfile.slice(0, idx) + lines.join('\n') + '\n\n' + dockerfile.slice(idx);
}

function agenticDockerfile(baseDf, repo, overlay) {
  const appDir = repo.appDir ?? '.';
  const pkg = overlay.package || overlay.agentConfig?.package;
  const installPkg = overlay.install?.package || pkg;
  if (!installPkg) throw new Error(`overlay for ${repo.id} missing install.package`);

  const pm = repo.packageManager?.startsWith('yarn')
    ? 'yarn'
    : repo.packageManager?.startsWith('npm') || (repo.commands?.install ?? '').startsWith('npm')
      ? 'npm'
      : 'pnpm';

  let addCmd;
  if (pm === 'npm') addCmd = `npm install --save-dev ${installPkg}`;
  else if (pm === 'yarn') addCmd = `yarn add -D ${installPkg}`;
  else {
    // Prefer ignore-workspace when the control install uses it
    const ignore = (repo.commands?.install ?? '').includes('--ignore-workspace')
      ? ' --ignore-workspace'
      : '';
    addCmd = `pnpm${ignore} add -D ${installPkg}`;
  }

  const workdir = appDir === '.' ? '/app' : `/app/${appDir}`;
  // Thin overlay on top of the task image (which itself FROMs the shared repo base).
  const block = [
    '# --- agentic-react overlay (arm B; thin layer on task image) ---',
    `COPY agentic-overlay-edits.json /opt/bench/agentic-overlay-edits.json`,
    `COPY AGENTS.snippet.md /opt/bench/AGENTS.snippet.md`,
    `WORKDIR ${workdir}`,
    `RUN ${addCmd}`,
    `RUN node /opt/bench/apply-edits.mjs "${workdir}" /opt/bench/agentic-overlay-edits.json`,
    `RUN for f in AGENTS.md CLAUDE.md; do \\`,
    `      target="/app/$f"; \\`,
    `      if [ -f "$target" ] || [ "${appDir}" = "." ]; then \\`,
    `        printf '\\n' >> "/app/$f"; cat /opt/bench/AGENTS.snippet.md >> "/app/$f"; \\`,
    `      fi; \\`,
    `    done`,
    `WORKDIR /app`,
    `ENV AGENTIC_REACT_OUT=compact`,
  ];
  return insertBeforeBaseline(baseDf, block);
}

const tasks = fs
  .readdirSync(vendorTasks)
  .filter((d) => fs.existsSync(path.join(vendorTasks, d, 'task.toml')))
  .filter((d) => !filter || d.includes(filter.replace(/\//g, '__')))
  .sort();

fs.rmSync(outRoot, { recursive: true, force: true });
fs.mkdirSync(outRoot, { recursive: true });

const man = manifest();
const unsupportedRepos = man.repos
  .filter((r) => {
    const st = r.agenticReactAdapter?.status ?? '';
    return !st.startsWith('supported') || !fs.existsSync(path.join(armsDir, `${r.id}.json`));
  })
  .map((r) => ({
    id: r.id,
    reason: !fs.existsSync(path.join(armsDir, `${r.id}.json`))
      ? `no arms/agentic/${r.id}.json`
      : `adapter status: ${r.agenticReactAdapter?.status}`,
  }));

let ok = 0;
for (const slug of tasks) {
  const src = path.join(vendorTasks, slug);
  const control = path.join(outRoot, 'control', slug);
  const agentic = path.join(outRoot, 'agentic', slug);
  fs.cpSync(src, control, { recursive: true });
  fs.cpSync(src, agentic, { recursive: true });

  // Infer repo id from slug (repo__task)
  const repoId = slug.split('__')[0];
  const repo = repoById(repoId);
  const overlay = loadOverlay(repoId);

  if (overlay) {
    const df = fs.readFileSync(path.join(agentic, 'environment', 'Dockerfile'), 'utf8');
    fs.writeFileSync(path.join(agentic, 'environment', 'Dockerfile'), agenticDockerfile(df, repo, overlay));
    fs.writeFileSync(
      path.join(agentic, 'environment', 'agentic-overlay-edits.json'),
      JSON.stringify(overlay.edits ?? [], null, 2) + '\n',
    );
    fs.copyFileSync(snippetPath, path.join(agentic, 'environment', 'AGENTS.snippet.md'));
    // Clear NODE_OPTIONS-style pollution for verifier (shared mode): grading must match stock checks.
    // Shared verifier runs in the agent image, but check-runner does not depend on the adapter.
    overlayStatus.supported.push(repoId);
  } else {
    overlayStatus.unsupported.push(repoId);
  }
  ok++;
  console.log(
    `  ${slug} → control + agentic${overlay ? ` (overlay ${repoId})` : ' (no overlay; agentic≡control image)'}`,
  );
}

const uniqueUnsupported = [...new Map(unsupportedRepos.map((x) => [x.id, x])).values()];
const uniqueSupported = [...new Set(overlayStatus.supported)];

fs.writeFileSync(
  path.join(outRoot, 'OVERLAY_STATUS.json'),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      supportedRepos: uniqueSupported,
      unsupportedRepos: uniqueUnsupported,
      note:
        'Agentic variant only differs when arms/agentic/<repo>.json exists. Unsupported repos still get an agentic/ copy identical to control for harness symmetry.',
    },
    null,
    2,
  ) + '\n',
);

console.log(`\nprepared ${ok} tasks → ${path.relative(BENCH, outRoot)}/{control,agentic}`);
console.log(`agentic overlay supported: ${uniqueSupported.join(', ') || '(none)'}`);
console.log('agentic overlay NOT yet supported:');
for (const u of uniqueUnsupported) console.log(`  - ${u.id}: ${u.reason}`);
