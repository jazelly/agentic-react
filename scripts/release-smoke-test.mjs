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

  const next = workflow.indexOf('\n      - name:', start + marker.length);
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
  assertContains(workflow, 'fetch-depth: 0', 'release checkout');

  const steps = [
    'Version packages from changesets',
    'Build packages',
    'Publish packages',
    'Push release tags',
    'Create GitHub releases',
  ];
  let previous = -1;

  for (const step of steps) {
    const index = workflow.indexOf(`- name: ${step}`);
    assert.ok(index > previous, `${step} should keep release step order`);
    previous = index;
  }

  assertContains(
    extractRunCommand('Version packages from changesets'),
    'find .changeset -maxdepth 1 -name "*.md" ! -name "README.md" | grep -q .',
    'changeset version gate',
  );
  assertContains(
    extractRunCommand('Version packages from changesets'),
    'git push origin HEAD:main',
    'version package push',
  );
  assert.equal(extractRunCommand('Publish packages'), 'pnpm run release');
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
};

const testPendingChangesetDetection = (workspace) => {
  const versionBlock = extractRunCommand('Version packages from changesets');

  const noChangesRepo = makeGitFixture(workspace, 'no-pending-changesets');
  const noChangesPnpm = makeFakePnpm(workspace, 'no-pending-changesets');
  runVersionBlock(noChangesRepo.repo, versionBlock, noChangesPnpm);

  assert.equal(
    fs.existsSync(noChangesPnpm.logPath),
    false,
    'changeset README alone should not run version-packages',
  );
  assert.equal(
    run('git', ['log', '-1', '--pretty=%s'], { cwd: noChangesRepo.repo }),
    'initial fixture',
    'no pending changesets should not create a version commit',
  );

  const pendingRepo = makeGitFixture(workspace, 'pending-changesets');
  const pendingPnpm = makeFakePnpm(workspace, 'pending-changesets');
  fs.writeFileSync(
    path.join(pendingRepo.repo, '.changeset/release-core.md'),
    '---\n"@agentic-react/core": patch\n---\n\nRelease core.\n',
  );

  runVersionBlock(pendingRepo.repo, versionBlock, pendingPnpm);

  assert.equal(
    fs.readFileSync(path.join(pendingRepo.repo, 'versioned.txt'), 'utf8'),
    'versioned\n',
    'pending changesets should run version-packages',
  );
  assert.equal(
    run('git', ['log', '-1', '--pretty=%s'], { cwd: pendingRepo.repo }),
    'chore: version packages',
    'pending changesets should create the expected version commit',
  );
  assert.equal(
    run('git', ['rev-parse', 'HEAD'], { cwd: pendingRepo.repo }),
    run('git', ['--git-dir', pendingRepo.origin, 'rev-parse', 'main']),
    'version commit should be pushed back to main',
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
    [
      'pending changeset detection',
      () => testPendingChangesetDetection(workspace),
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
