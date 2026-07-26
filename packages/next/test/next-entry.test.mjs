import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { withAgenticReactNext } from '../dist/index.js';

const createWebpackContext = () => ({
  dev: true,
  isServer: false,
  webpack: {
    DefinePlugin: class DefinePlugin {},
  },
});

const firstEntryPath = async (transformedConfig) => {
  const resolvedEntry = await transformedConfig.entry();
  assert.ok(Array.isArray(resolvedEntry.main));
  return resolvedEntry.main[0];
};

test('dev client entry is generated outside .next and restored when missing', async () => {
  const rootDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'agentic-react-next-entry-'),
  );

  try {
    const nextConfig = withAgenticReactNext(
      {},
      {
        rootDir,
        settingsRoot: path.join(rootDir, '.agentic-react-test'),
        server: { enabled: false },
      },
    );
    const transformedConfig = nextConfig.webpack(
      {
        entry: async () => ({
          main: ['./app/page.js'],
        }),
      },
      createWebpackContext(),
    );

    const generatedEntryPath = await firstEntryPath(transformedConfig);
    const nextDirectory = path.join(rootDir, '.next') + path.sep;

    assert.equal(typeof generatedEntryPath, 'string');
    assert.equal(generatedEntryPath.startsWith(nextDirectory), false);
    assert.equal(fs.existsSync(generatedEntryPath), true);

    fs.rmSync(generatedEntryPath, { force: true });

    const restoredEntryPath = await firstEntryPath(transformedConfig);

    assert.equal(restoredEntryPath, generatedEntryPath);
    assert.equal(fs.existsSync(restoredEntryPath), true);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
