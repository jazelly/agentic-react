import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), '..');
const workflowPath = path.join(rootDir, '.github/workflows/release.yml');
const workflow = fs.readFileSync(workflowPath, 'utf8');

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    encoding: 'utf8',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      [
        `${command} ${args.join(' ')} failed with exit code ${result.status}`,
        result.stdout,
        result.stderr,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }

  return result.stdout.trim();
};

const assertContains = (value, expected, label) => {
  assert.ok(
    value.includes(expected),
    `${label} should contain ${JSON.stringify(expected)}`,
  );
};

const extractRunCommand = (stepName) => {
  const marker = `- name: ${stepName}`;
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, `release workflow should include ${stepName}`);

  const lineStart = workflow.lastIndexOf('\n', start) + 1;
  const indentation = workflow.slice(lineStart, start);
  const nextStep = workflow.indexOf(
    `\n${indentation}- name:`,
    start + marker.length,
  );
  const remainingWorkflow = workflow.slice(start + marker.length);
  const shallowerBoundary = remainingWorkflow.match(
    new RegExp(`\\n {0,${indentation.length - 1}}\\S`),
  );
  const nextSection = shallowerBoundary
    ? start + marker.length + shallowerBoundary.index
    : -1;
  const boundaries = [nextStep, nextSection].filter((index) => index !== -1);
  const next = boundaries.length > 0 ? Math.min(...boundaries) : -1;
  const step = workflow.slice(start, next === -1 ? undefined : next);
  const scalarRun = step.match(/\n        run: ([^\n]+)/);

  if (scalarRun && scalarRun[1].trim() !== '|') {
    return scalarRun[1].trim();
  }

  const blockMarker = '\n        run: |\n';
  const blockStart = step.indexOf(blockMarker);
  assert.notEqual(blockStart, -1, `${stepName} should define a run command`);

  return step
    .slice(blockStart + blockMarker.length)
    .split('\n')
    .map((line) => (line.startsWith('          ') ? line.slice(10) : line))
    .join('\n')
    .replace(/\n+$/, '');
};

const makeGitFixture = (workspace, name) => {
  const repo = path.join(workspace, name);
  const origin = path.join(workspace, `${name}-origin.git`);

  fs.mkdirSync(repo, { recursive: true });
  run('git', ['init', '--bare', origin]);
  run('git', ['init'], { cwd: repo });
  run('git', ['config', 'user.name', 'Release Smoke'], { cwd: repo });
  run('git', ['config', 'user.email', 'release-smoke@example.com'], {
    cwd: repo,
  });
  run('git', ['branch', '-M', 'main'], { cwd: repo });

  fs.writeFileSync(path.join(repo, 'README.md'), '# Fixture\n');
  fs.mkdirSync(path.join(repo, '.changeset'));
  fs.writeFileSync(path.join(repo, '.changeset/README.md'), '# Changesets\n');

  run('git', ['add', '.'], { cwd: repo });
  run('git', ['commit', '-m', 'initial fixture'], { cwd: repo });
  run('git', ['remote', 'add', 'origin', origin], { cwd: repo });
  run('git', ['push', '-u', 'origin', 'main'], { cwd: repo });

  return { repo, origin };
};

const makeFakePnpm = (workspace, name) => {
  const binDir = path.join(workspace, `${name}-bin`);
  const logPath = path.join(workspace, `${name}-pnpm.log`);
  const pnpmPath = path.join(binDir, 'pnpm');

  fs.mkdirSync(binDir);
  fs.writeFileSync(
    pnpmPath,
    `#!/bin/sh
echo "$@" >> "$PNPM_LOG"

if [ "$1" = "changeset" ] && [ "$2" = "status" ] && [ "$3" = "--output" ]; then
  printf '{"releases":[{"name":"@agentic-react/core","newVersion":"1.0.0"}]}\n' > "$4"
  exit 0
fi

if [ "$1" = "run" ] && [ "$2" = "version-packages" ]; then
  printf "versioned\\n" > versioned.txt
  exit 0
fi

exit 64
`,
  );
  fs.chmodSync(pnpmPath, 0o755);

  return { binDir, logPath };
};

const makeFakeGh = (workspace, name) => {
  const binDir = path.join(workspace, `${name}-bin`);
  const logPath = path.join(workspace, `${name}-gh.log`);
  const ghPath = path.join(binDir, 'gh');

  fs.mkdirSync(binDir);
  fs.writeFileSync(
    ghPath,
    `#!/bin/sh
echo "$@" >> "$GH_LOG"

if [ "$1" = "release" ] && [ "$2" = "view" ]; then
  case " $GH_EXISTING_RELEASES " in
    *" $3 "*) exit 0 ;;
    *) exit 1 ;;
  esac
fi

if [ "$1" = "release" ] && [ "$2" = "create" ]; then
  exit 0
fi

exit 64
`,
  );
  fs.chmodSync(ghPath, 0o755);

  return { binDir, logPath };
};

const runVersionBlock = (repo, command, fakePnpm) => {
  run('/bin/sh', ['-c', command], {
    cwd: repo,
    env: {
      PATH: `${fakePnpm.binDir}${path.delimiter}${process.env.PATH}`,
      PNPM_LOG: fakePnpm.logPath,
    },
  });
};

const runShellBlock = (repo, command, env = {}) => {
  run('bash', ['-c', command], {
    cwd: repo,
    env,
  });
};

const commitAndPush = (repo, message) => {
  run('git', ['add', '.'], { cwd: repo });
  run('git', ['commit', '-m', message], { cwd: repo });
  run('git', ['push', 'origin', 'HEAD:main'], { cwd: repo });
};

const commitReleaseMarker = (repo) => {
  const sourceSha = run('git', ['rev-parse', 'HEAD'], { cwd: repo });
  fs.writeFileSync(
    path.join(repo, '.changeset/release-pending.json'),
    `${JSON.stringify({ sourceSha }, undefined, 2)}\n`,
  );
  run('git', ['add', '.changeset/release-pending.json'], { cwd: repo });
  run(
    'git',
    [
      '-c',
      'user.name=github-actions[bot]',
      '-c',
      'user.email=41898282+github-actions[bot]@users.noreply.github.com',
      'commit',
      '-m',
      'chore(release): version packages',
    ],
    { cwd: repo },
  );
  run('git', ['push', 'origin', 'HEAD:main'], { cwd: repo });
};

const inspectReleaseState = (workspace, fixture, name) => {
  const outputPath = path.join(workspace, `${name}-output.txt`);
  const summaryPath = path.join(workspace, `${name}-summary.md`);

  runShellBlock(fixture.repo, extractRunCommand('Inspect release state'), {
    GITHUB_OUTPUT: outputPath,
    GITHUB_STEP_SUMMARY: summaryPath,
  });

  return Object.fromEntries(
    fs
      .readFileSync(outputPath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => line.split('=')),
  );
};

const list = (value) => value.split('\n').filter(Boolean).sort();

const runGitHubReleaseBlock = (
  repo,
  command,
  fakeGh,
  existingReleases = [],
) => {
  run('bash', ['-c', command], {
    cwd: repo,
    env: {
      PATH: `${fakeGh.binDir}${path.delimiter}${process.env.PATH}`,
      GH_EXISTING_RELEASES: existingReleases.join(' '),
      GH_LOG: fakeGh.logPath,
      GH_TOKEN: 'fake-token',
    },
  });
};

const testWorkflowContract = () => {
  assertContains(workflow, 'branches: [main]', 'release trigger');
  assert.ok(
    !workflow.includes('workflow_dispatch:'),
    'release workflow should not be manually dispatchable from dev',
  );
  assertContains(workflow, 'fetch-depth: 0', 'release checkout');
  assertContains(
    workflow,
    "if: github.ref == 'refs/heads/main' && needs.preflight.outputs.release-required == 'true'",
    'release preflight gate',
  );

  const steps = [
    'Version packages from changesets',
    'Release smoke test',
    'Build packages',
    'Test',
    'Commit version packages',
    'Publish packages',
    'Ensure package publication succeeded',
    'Reconcile release tags',
    'Push release tags',
    'Create GitHub releases',
    'Clear recovery state',
  ];
  let previous = -1;

  for (const step of steps) {
    const index = workflow.indexOf(`- name: ${step}`);
    assert.ok(index > previous, `${step} should keep release step order`);
    previous = index;
  }

  assertContains(
    extractRunCommand('Inspect release state'),
    'find .changeset -maxdepth 1 -name "*.md" ! -name "README.md" | grep -q .',
    'changeset preflight gate',
  );
  assertContains(
    extractRunCommand('Version packages from changesets'),
    '> .changeset/release-pending.json',
    'durable recovery marker',
  );
  assertContains(
    extractRunCommand('Version packages from changesets'),
    'git add -A',
    'release changes staged before validation',
  );
  assertContains(
    extractRunCommand('Validate recovery state'),
    'expected_tree="$(git write-tree)"',
    'deterministic recovery verification',
  );
  assert.ok(
    !extractRunCommand('Version packages from changesets').includes(
      'git push origin HEAD:main',
    ),
    'versioning should not push before validation',
  );
  assertContains(
    extractRunCommand('Commit version packages'),
    'git push origin HEAD:main',
    'validated version package push',
  );
  assert.ok(
    !extractRunCommand('Commit version packages').includes('git add -A'),
    'validation artifacts should not enter the version commit',
  );
  assert.equal(extractRunCommand('Publish packages'), 'pnpm run release');
  assertContains(
    workflow,
    'continue-on-error: true',
    'partial publication recovery',
  );
  assertContains(
    extractRunCommand('Reconcile release tags'),
    "readFileSync('.changeset/release-plan.json', 'utf8')",
    'release plan tag recovery',
  );
  assert.equal(
    extractRunCommand('Push release tags'),
    'git push origin --tags',
  );

  const releaseBlock = extractRunCommand('Create GitHub releases');
  assertContains(
    releaseBlock,
    'git tag --points-at HEAD | grep "^@agentic-react/"',
    'release tag selection',
  );
  assertContains(releaseBlock, 'gh release view "$tag"', 'release idempotency');
  assertContains(releaseBlock, 'gh release create "$tag"', 'release creation');
  assertContains(
    extractRunCommand('Clear recovery state'),
    'git rm .changeset/release-pending.json',
    'recovery cleanup',
  );
};

const testReleasePreflight = (workspace) => {
  const noChangesRepo = makeGitFixture(workspace, 'no-pending-changesets');
  const noChanges = inspectReleaseState(
    workspace,
    noChangesRepo,
    'no-pending-changesets',
  );
  assert.equal(noChanges['release-required'], 'false');
  assert.equal(noChanges['release-mode'], 'none');

  const pendingRepo = makeGitFixture(workspace, 'pending-changesets');
  fs.writeFileSync(
    path.join(pendingRepo.repo, '.changeset/release-core.md'),
    '---\n"@agentic-react/core": patch\n---\n\nRelease core.\n',
  );
  commitAndPush(pendingRepo.repo, 'add core changeset');
  const pending = inspectReleaseState(
    workspace,
    pendingRepo,
    'pending-changesets',
  );
  assert.equal(pending['release-required'], 'true');
  assert.equal(pending['release-mode'], 'version');

  const recoveryRepo = makeGitFixture(workspace, 'release-recovery');
  fs.writeFileSync(
    path.join(recoveryRepo.repo, '.changeset/release-core.md'),
    '---\n"@agentic-react/core": patch\n---\n\nRelease core.\n',
  );
  commitAndPush(recoveryRepo.repo, 'add recovery changeset');
  commitReleaseMarker(recoveryRepo.repo);
  const recoveryCommit = run('git', ['rev-parse', 'HEAD'], {
    cwd: recoveryRepo.repo,
  });
  const recovery = inspectReleaseState(
    workspace,
    recoveryRepo,
    'release-recovery',
  );
  assert.equal(recovery['release-required'], 'true');
  assert.equal(recovery['release-mode'], 'recovery');
  assert.equal(recovery['release-sha'], recoveryCommit);

  const untrustedRepo = makeGitFixture(workspace, 'untrusted-recovery');
  fs.writeFileSync(
    path.join(untrustedRepo.repo, '.changeset/release-pending.json'),
    '{"sourceSha":"fixture"}\n',
  );
  commitAndPush(untrustedRepo.repo, 'add untrusted recovery marker');
  assert.throws(
    () =>
      inspectReleaseState(
        workspace,
        untrustedRepo,
        'untrusted-recovery',
      ),
    /release recovery marker was not created by the release workflow/,
  );
};

const testVersionLifecycle = (workspace) => {
  const fixture = makeGitFixture(workspace, 'version-lifecycle');
  const fakePnpm = makeFakePnpm(workspace, 'version-lifecycle');
  const sourceSha = run('git', ['rev-parse', 'HEAD'], { cwd: fixture.repo });
  const versionBlock = extractRunCommand('Version packages from changesets')
    .split('${{ needs.preflight.outputs.release-sha }}')
    .join(sourceSha);

  runVersionBlock(fixture.repo, versionBlock, fakePnpm);

  assert.equal(
    fs.readFileSync(path.join(fixture.repo, 'versioned.txt'), 'utf8'),
    'versioned\n',
    'pending changesets should run version-packages',
  );
  assert.deepEqual(
    JSON.parse(
      fs.readFileSync(
        path.join(fixture.repo, '.changeset/release-pending.json'),
        'utf8',
      ),
    ),
    { sourceSha },
    'versioning should create a durable release marker',
  );
  assert.deepEqual(
    JSON.parse(
      fs.readFileSync(
        path.join(fixture.repo, '.changeset/release-plan.json'),
        'utf8',
      ),
    ).releases,
    [{ name: '@agentic-react/core', newVersion: '1.0.0' }],
    'versioning should preserve the package release plan',
  );
  assert.equal(
    run('git', ['log', '-1', '--pretty=%s'], { cwd: fixture.repo }),
    'initial fixture',
    'versioning should not commit before validation',
  );

  runShellBlock(fixture.repo, extractRunCommand('Commit version packages'));
  assert.equal(
    run('git', ['log', '-1', '--pretty=%s'], { cwd: fixture.repo }),
    'chore(release): version packages',
    'validated version state should be committed',
  );
  assert.equal(
    run('git', ['rev-parse', 'HEAD'], { cwd: fixture.repo }),
    run('git', ['--git-dir', fixture.origin, 'rev-parse', 'main']),
    'validated version commit should be pushed to main',
  );

  runShellBlock(fixture.repo, extractRunCommand('Reconcile release tags'));
  assert.equal(
    run('git', ['tag', '--list', '@agentic-react/core@1.0.0'], {
      cwd: fixture.repo,
    }),
    '@agentic-react/core@1.0.0',
    'successful recovery should restore tags from the release plan',
  );

  runShellBlock(fixture.repo, extractRunCommand('Clear recovery state'));
  assert.equal(
    fs.existsSync(
      path.join(fixture.repo, '.changeset/release-pending.json'),
    ),
    false,
    'successful release cleanup should remove the recovery marker',
  );
};

const makeVersionedReleaseFixture = (workspace, name, tamperPlan = false) => {
  const repo = path.join(workspace, name);
  const changesetsBin = path.join(
    rootDir,
    'node_modules/@changesets/cli/bin.js',
  );

  run('git', ['clone', '--quiet', '--no-local', rootDir, repo]);
  run('git', ['checkout', '-B', 'main', 'origin/main'], { cwd: repo });
  run('git', ['config', 'user.name', 'Release Smoke'], { cwd: repo });
  run('git', ['config', 'user.email', 'release-smoke@example.com'], {
    cwd: repo,
  });
  fs.writeFileSync(
    path.join(repo, '.changeset/release-core.md'),
    '---\n"@agentic-react/core": patch\n---\n\nRelease core.\n',
  );
  run('git', ['add', '.changeset/release-core.md'], { cwd: repo });
  run('git', ['commit', '-m', 'add core release'], { cwd: repo });

  const sourceSha = run('git', ['rev-parse', 'HEAD'], { cwd: repo });
  run('node', [changesetsBin, 'status', '--output', '.changeset/release-plan.json'], {
    cwd: repo,
  });
  run('node', [changesetsBin, 'version'], { cwd: repo });
  fs.writeFileSync(
    path.join(repo, '.changeset/release-pending.json'),
    `${JSON.stringify({ sourceSha }, undefined, 2)}\n`,
  );

  if (tamperPlan) {
    const planPath = path.join(repo, '.changeset/release-plan.json');
    const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
    plan.releases[0].newVersion = '99.0.0';
    fs.writeFileSync(planPath, `${JSON.stringify(plan, undefined, 2)}\n`);
  }

  run('git', ['add', '.'], { cwd: repo });
  run(
    'git',
    [
      '-c',
      'user.name=github-actions[bot]',
      '-c',
      'user.email=41898282+github-actions[bot]@users.noreply.github.com',
      'commit',
      '-m',
      'chore(release): version packages',
    ],
    { cwd: repo },
  );

  return {
    repo,
    releaseSha: run('git', ['rev-parse', 'HEAD'], { cwd: repo }),
  };
};

const testRecoveryTreeVerification = (workspace) => {
  const validationBlock = extractRunCommand('Validate recovery state');
  const valid = makeVersionedReleaseFixture(
    workspace,
    'valid-recovery-tree',
  );
  runShellBlock(
    valid.repo,
    validationBlock
      .split('${{ needs.preflight.outputs.release-sha }}')
      .join(valid.releaseSha),
    { GITHUB_WORKSPACE: rootDir },
  );

  const tampered = makeVersionedReleaseFixture(
    workspace,
    'tampered-recovery-tree',
    true,
  );
  assert.throws(
    () =>
      runShellBlock(
        tampered.repo,
        validationBlock
          .split('${{ needs.preflight.outputs.release-sha }}')
          .join(tampered.releaseSha),
        { GITHUB_WORKSPACE: rootDir },
      ),
    /failed with exit code 1/,
    'recovery should reject a forged release plan even with bot metadata',
  );
};

const testTagPush = (workspace) => {
  const tagFixture = makeGitFixture(workspace, 'tag-push');
  const tagPushCommand = extractRunCommand('Push release tags');

  run('git', ['tag', '@agentic-react/core@1.0.0'], {
    cwd: tagFixture.repo,
  });
  run('git', ['tag', 'v1.0.0'], { cwd: tagFixture.repo });
  run('/bin/sh', ['-c', tagPushCommand], { cwd: tagFixture.repo });

  assert.deepEqual(
    list(run('git', ['--git-dir', tagFixture.origin, 'tag', '--list'])),
    ['@agentic-react/core@1.0.0', 'v1.0.0'],
    'release tags should be pushed to origin',
  );
};

const testGitHubReleaseCreation = (workspace) => {
  const releaseFixture = makeGitFixture(workspace, 'github-release-selection');
  const fakeGh = makeFakeGh(workspace, 'github-release-selection');
  const releaseBlock = extractRunCommand('Create GitHub releases');
  const oldHead = run('git', ['rev-parse', 'HEAD'], {
    cwd: releaseFixture.repo,
  });

  run('git', ['tag', '@agentic-react/core@0.9.0', oldHead], {
    cwd: releaseFixture.repo,
  });
  fs.appendFileSync(path.join(releaseFixture.repo, 'README.md'), '\nnext\n');
  run('git', ['add', 'README.md'], { cwd: releaseFixture.repo });
  run('git', ['commit', '-m', 'second fixture commit'], {
    cwd: releaseFixture.repo,
  });
  run('git', ['tag', '@agentic-react/core@1.0.0'], {
    cwd: releaseFixture.repo,
  });
  run('git', ['tag', '@agentic-react/vite@1.0.0'], {
    cwd: releaseFixture.repo,
  });
  run('git', ['tag', 'v1.0.0'], { cwd: releaseFixture.repo });

  runGitHubReleaseBlock(releaseFixture.repo, releaseBlock, fakeGh, [
    '@agentic-react/vite@1.0.0',
  ]);

  const ghCalls = fs.readFileSync(fakeGh.logPath, 'utf8').trim().split('\n');

  assert.deepEqual(
    ghCalls,
    [
      'release view @agentic-react/core@1.0.0',
      [
        'release create @agentic-react/core@1.0.0',
        '--title @agentic-react/core@1.0.0',
        '--generate-notes --latest',
      ].join(' '),
      'release view @agentic-react/vite@1.0.0',
    ],
    [
      'GitHub release workflow should create missing package releases',
      'at HEAD only',
    ].join(' '),
  );
};

const workspace = fs.mkdtempSync(
  path.join(os.tmpdir(), 'agentic-react-release-smoke-'),
);

try {
  const tests = [
    ['workflow contract', () => testWorkflowContract()],
    ['release preflight', () => testReleasePreflight(workspace)],
    ['version lifecycle', () => testVersionLifecycle(workspace)],
    [
      'recovery tree verification',
      () => testRecoveryTreeVerification(workspace),
    ],
    ['release tag push', () => testTagPush(workspace)],
    [
      'GitHub release creation',
      () => testGitHubReleaseCreation(workspace),
    ],
  ];

  for (const [name, test] of tests) {
    test();
    console.info(`ok - ${name}`);
  }
} finally {
  fs.rmSync(workspace, { recursive: true, force: true });
}
