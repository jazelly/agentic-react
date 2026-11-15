/**
 * Shared helpers for Harbor repo-base images + thin task Dockerfiles.
 * Base = clone@SHA + install + postInstall + fonts/typegen/playwright (repo-wide).
 * Task = FROM base + setup edits (+ agentic overlay) + baseline commit.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { BENCH, REPOS, listTasks, manifest } from '../lib/task-kit.mjs';

export const BASE_IMAGE_PREFIX = 'agentic-react/base';
export const basesRoot = path.join(BENCH, 'vendor/agentic-react-harbor/bases');
export const runtimeDir = path.join(BENCH, 'harbor-runtime');

export function harborSlug(taskId) {
  return taskId.replace(/\//g, '__');
}

export function nodeDockerImage(repo) {
  if (repo.harbor?.nodeImage) return repo.harbor.nodeImage;
  const engines = repo.engines?.node ?? '';
  if (/^\^22(\.|$)/.test(engines.trim()) && !engines.includes('||')) return 'node:22-bookworm';
  return 'node:24-bookworm';
}

export function needsPlaywrightBrowsers(task) {
  return (task.check?.steps ?? []).some((s) => {
    if (s.optional) return false;
    return (
      s.type === 'browser' ||
      (s.type === 'hidden-test' && /--browser|browser\.headless|playwright/i.test(String(s.run ?? '')))
    );
  });
}

export function repoNeedsPlaywright(repoId) {
  return listTasks(repoId).some((t) => t.repo === repoId && needsPlaywrightBrowsers(t));
}

export function needsGoogleFonts(repo) {
  return (
    repo.harbor?.prefetchGoogleFonts === true ||
    repo.id === 'next-webpack-jsoncrack' ||
    repo.id === 'next-turbopack-boilerplate'
  );
}

export function needsNextTypegen(repo) {
  return repo.harbor?.nextTypegen === true || repo.id === 'next-turbopack-boilerplate';
}

function installCommand(repo) {
  let install = repo.commands?.install ?? 'echo "no install command"';
  if (repo.harbor?.ignoreInstallScripts && !/\b--ignore-scripts\b/.test(install)) {
    install = `${install} --ignore-scripts`;
  }
  return install;
}

function pmHint(repo, install) {
  if (repo.packageManager?.startsWith('pnpm') || install.includes('pnpm')) return 'pnpm';
  if (repo.packageManager?.startsWith('yarn') || install.includes('yarn')) return 'yarn';
  return 'npm';
}

function workdirs(repo) {
  const appDir = repo.appDir ?? '.';
  const workdirApp = appDir === '.' ? '/app' : `/app/${appDir}`;
  const installWorkdir = repo.commandsCwd === 'appDir' ? workdirApp : '/app';
  return { appDir, workdirApp, installWorkdir };
}

/** Dockerfile that builds the shared per-repo base (no task setup edits). */
export function repoBaseDockerfile(repo) {
  const { appDir, workdirApp, installWorkdir } = workdirs(repo);
  const sparsePaths = (repo.sparse ?? []).map((p) => JSON.stringify(p)).join(' ');
  const sparseBlock = repo.sparse?.length
    ? ` && git sparse-checkout init --cone && git sparse-checkout set ${sparsePaths}`
    : '';
  const install = installCommand(repo);
  const pm = pmHint(repo, install);
  const nodeImage = nodeDockerImage(repo);
  const enginesNote = repo.engines?.node
    ? `engines.node ${repo.engines.node}`
    : 'no engines.node pin (default)';
  const pnpmAllowBuilds = pm === 'pnpm' ? 'pnpm config set dangerouslyAllowAllBuilds true && ' : '';

  const preInstallCmds = []
    .concat(repo.harbor?.preInstall ?? [])
    .map((c) => String(c).trim())
    .filter(Boolean);
  const preInstallBlock = preInstallCmds.length
    ? `
# Harbor pre-install (${repo.id}).
WORKDIR ${installWorkdir}
RUN ${preInstallCmds.join(' \\\n && ')}
WORKDIR /app
`
    : '';

  const postInstallCmds = []
    .concat(repo.harbor?.postInstall ?? [])
    .map((c) => String(c).trim())
    .filter(Boolean);
  const postInstallBlock = postInstallCmds.length
    ? `
# Harbor post-install (${repo.id}).
WORKDIR ${installWorkdir}
RUN ${postInstallCmds.join(' \\\n && ')}
WORKDIR /app
`
    : '';

  const googleFontsBlock = needsGoogleFonts(repo)
    ? `
COPY prefetch-google-fonts.mjs /opt/bench/prefetch-google-fonts.mjs
RUN node /opt/bench/prefetch-google-fonts.mjs --out /opt/bench --app "${workdirApp}"
ENV NEXT_FONT_GOOGLE_MOCKED_RESPONSES=/opt/bench/mocked-google-fonts.cjs
`
    : '';

  const nextTypegenBlock = needsNextTypegen(repo)
    ? `
# Generate next-env.d.ts + .next/types (not committed upstream).
WORKDIR ${workdirApp}
RUN npx next typegen
WORKDIR /app
`
    : '';

  // Repo-wide Playwright: any task that needs browsers shares this layer.
  const playwrightBlock = repoNeedsPlaywright(repo.id)
    ? `
# Playwright chromium for browser-mode checks (shared across tasks for this repo).
WORKDIR ${workdirApp}
RUN if [ -x node_modules/.bin/playwright ]; then \\
      ./node_modules/.bin/playwright install chromium --with-deps; \\
    elif command -v pnpm >/dev/null && pnpm exec playwright --version >/dev/null 2>&1; then \\
      pnpm exec playwright install chromium --with-deps; \\
    else \\
      npx --yes playwright@1.59.1 install chromium --with-deps; \\
    fi
WORKDIR /app
`
    : '';

  return `# Generated by scripts/convert-to-harbor.mjs — repo base for ${repo.id}.
# Node ${nodeImage} (${enginesNote}).
# Task Dockerfiles FROM this image; rebuild when SHA / lockfile / this Dockerfile change.
FROM ${nodeImage}

RUN apt-get update -qq \\
 && apt-get install -y -qq git ca-certificates python3 \\
 && rm -rf /var/lib/apt/lists/* \\
 && corepack enable

WORKDIR /app

ARG REPO_URL=${JSON.stringify(repo.repo)}
ARG BASE_SHA=${JSON.stringify(repo.sha)}
ENV BENCH_APP_DIR=${JSON.stringify(appDir)}
ENV BENCH_REPO_ID=${JSON.stringify(repo.id)}

# Pin to BASE_SHA on a real branch with no future history / remotes.
# Full clone (not --filter=blob:none): partial clones break under git gc --prune.
RUN git clone${repo.sparse?.length ? ' --sparse' : ''} "$REPO_URL" . \\
 && DEFAULT="$(git remote show origin | sed -n 's/.*HEAD branch: //p')" \\
 && DEFAULT="\${DEFAULT:-main}"${sparseBlock} \\
 && git checkout -B "$DEFAULT" "$BASE_SHA" \\
 && git remote remove origin \\
 && for b in $(git for-each-ref --format='%(refname:short)' refs/heads | grep -vx "$DEFAULT"); do git branch -D "$b" || true; done \\
 && for t in $(git tag); do git merge-base --is-ancestor "$t" HEAD 2>/dev/null || git tag -d "$t"; done \\
 && git reflog expire --expire=now --all \\
 && (git gc --prune=now || true) \\
 && (git submodule update --init --recursive || true)

${preInstallBlock}
# Package manager install (from manifest.json). ${pm}
WORKDIR ${installWorkdir}
RUN ${pnpmAllowBuilds}${install}
WORKDIR /app
${postInstallBlock}${googleFontsBlock}${nextTypegenBlock}${playwrightBlock}
# Clean tree ready for per-task setup edits (applied in the thin task image).
CMD ["/bin/bash"]
`;
}

/** Thin task Dockerfile: FROM shared base, apply setup edits, scratch baseline. */
export function taskDockerfile(repo, task, baseImageRef) {
  const { workdirApp } = workdirs(repo);
  return `# Generated by scripts/convert-to-harbor.mjs — thin task image.
# Shares repo base ${baseImageRef} (clone + deps + browsers).
FROM ${baseImageRef}

ENV BENCH_TASK_ID=${JSON.stringify(task.id)}

COPY apply-edits.mjs /opt/bench/apply-edits.mjs
COPY setup-edits.json /opt/bench/setup-edits.json
RUN node /opt/bench/apply-edits.mjs "${workdirApp}" /opt/bench/setup-edits.json

# Scratch baseline: agent / oracle diffs are relative to post-setup tree.
RUN git config user.email bench@local \\
 && git config user.name bench \\
 && git config core.hooksPath /dev/null \\
 && git add -A \\
 && git commit -qm bench-baseline --allow-empty --no-verify

CMD ["/bin/bash"]
`;
}

/** Hash inputs that should invalidate the repo base image. */
export function repoBaseCacheKey(repo, baseDockerfileText) {
  const h = crypto.createHash('sha256');
  h.update('v1\n');
  h.update(repo.id + '\n');
  h.update(repo.sha + '\n');
  h.update(nodeDockerImage(repo) + '\n');
  h.update(baseDockerfileText);
  const cloneRoot = path.join(REPOS, repo.id);
  const lockCandidates = [
    'pnpm-lock.yaml',
    'package-lock.json',
    'yarn.lock',
    path.join(repo.appDir ?? '.', 'pnpm-lock.yaml'),
    path.join(repo.appDir ?? '.', 'package-lock.json'),
    path.join(repo.appDir ?? '.', 'yarn.lock'),
  ];
  for (const rel of lockCandidates) {
    const p = path.join(cloneRoot, rel);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      h.update(rel + '\n');
      h.update(fs.readFileSync(p));
    }
  }
  return h.digest('hex').slice(0, 12);
}

export function baseImageRef(repoId, key) {
  // Docker tag: lowercase, no uppercase in name; repo ids are already kebab-case.
  return `${BASE_IMAGE_PREFIX}-${repoId}:${key}`;
}

export function writeRepoBase(repo) {
  const dir = path.join(basesRoot, repo.id);
  fs.mkdirSync(dir, { recursive: true });
  const df = repoBaseDockerfile(repo);
  fs.writeFileSync(path.join(dir, 'Dockerfile'), df);
  if (needsGoogleFonts(repo) && fs.existsSync(path.join(runtimeDir, 'prefetch-google-fonts.mjs'))) {
    fs.copyFileSync(
      path.join(runtimeDir, 'prefetch-google-fonts.mjs'),
      path.join(dir, 'prefetch-google-fonts.mjs'),
    );
  }
  const key = repoBaseCacheKey(repo, df);
  const ref = baseImageRef(repo.id, key);
  fs.writeFileSync(
    path.join(dir, 'image-ref.txt'),
    ref + '\n',
  );
  fs.writeFileSync(
    path.join(dir, 'cache-key.json'),
    JSON.stringify(
      {
        repoId: repo.id,
        sha: repo.sha,
        key,
        image: ref,
        nodeImage: nodeDockerImage(repo),
      },
      null,
      2,
    ) + '\n',
  );
  return { dir, key, ref, dockerfile: df };
}

export function imageExistsLocally(ref) {
  const r = spawnSync('docker', ['image', 'inspect', ref], { encoding: 'utf8' });
  return r.status === 0;
}

/** Build (or skip) one repo base. Returns {ref, built, skipped, seconds}. */
export function buildRepoBase(repo, { force = false } = {}) {
  const { dir, ref, key } = writeRepoBase(repo);
  if (!force && imageExistsLocally(ref)) {
    return { repoId: repo.id, ref, key, built: false, skipped: true, seconds: 0 };
  }
  const t0 = Date.now();
  console.log(`[base] BUILD ${ref}`);
  const r = spawnSync(
    'docker',
    ['build', '-t', ref, '-f', path.join(dir, 'Dockerfile'), dir],
    { cwd: BENCH, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  const seconds = (Date.now() - t0) / 1000;
  if (r.status !== 0) {
    const tail = `${r.stdout ?? ''}${r.stderr ?? ''}`.slice(-4000);
    throw new Error(`docker build failed for ${ref} (${seconds.toFixed(1)}s):\n${tail}`);
  }
  console.log(`[base] OK ${ref} (${seconds.toFixed(1)}s)`);
  return { repoId: repo.id, ref, key, built: true, skipped: false, seconds };
}

export function reposWithTasks() {
  const ids = new Set(listTasks().map((t) => t.repo));
  return manifest().repos.filter((r) => ids.has(r.id));
}
