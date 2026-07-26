import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { withAgenticReactWebpack } from '../dist/index.js';

const withNodeEnv = (value, run) => {
  const previous = process.env.NODE_ENV;
  try {
    if (value === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = value;
    }
    return run();
  } finally {
    if (previous === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previous;
    }
  }
};

const createTestPaths = () => {
  const rootDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'agentic-react-webpack-mode-'),
  );
  return {
    rootDir,
    settingsRoot: path.join(rootDir, '.settings-test'),
    generatedDirectory: path.join(rootDir, '.agentic-react-webpack'),
  };
};

const assertNotInjected = (config, env, nodeEnv) => {
  const paths = createTestPaths();
  try {
    const result = withNodeEnv(nodeEnv, () =>
      withAgenticReactWebpack(config, env, {
        rootDir: paths.rootDir,
        settingsRoot: paths.settingsRoot,
      }),
    );

    assert.strictEqual(result, config);
    assert.equal(fs.existsSync(paths.generatedDirectory), false);
    assert.equal(fs.existsSync(paths.settingsRoot), false);
  } finally {
    fs.rmSync(paths.rootDir, { recursive: true, force: true });
  }
};

const assertInjected = (config, env, nodeEnv) => {
  const paths = createTestPaths();
  try {
    const result = withNodeEnv(nodeEnv, () =>
      withAgenticReactWebpack(config, env, {
        rootDir: paths.rootDir,
        settingsRoot: paths.settingsRoot,
      }),
    );

    assert.notStrictEqual(result, config);
    assert.ok(Array.isArray(result.entry));
    assert.equal(result.entry[1], config.entry);
    assert.equal(fs.existsSync(result.entry[0]), true);
    assert.equal(typeof result.devServer?.setupMiddlewares, 'function');
    assert.equal(typeof result.devServer?.onListening, 'function');
  } finally {
    fs.rmSync(paths.rootDir, { recursive: true, force: true });
  }
};

test('config production mode stays untouched even when NODE_ENV is development', () => {
  const config = { mode: 'production', entry: './src.js' };
  assertNotInjected(config, {}, 'development');
});

test('missing mode stays untouched when NODE_ENV is missing', () => {
  const config = { entry: './src.js' };
  assertNotInjected(config, {}, undefined);
});

test('an unknown explicit mode stays untouched', () => {
  const config = { mode: 'development', entry: './src.js' };
  assertNotInjected(config, { mode: 'staging' }, 'development');
});

test('env mode takes precedence over config mode and NODE_ENV', () => {
  assertInjected(
    { mode: 'production', entry: './src.js' },
    { mode: 'development' },
    'production',
  );

  const config = { mode: 'development', entry: './src.js' };
  assertNotInjected(config, { mode: 'production' }, 'development');
});

test('config development mode injects when env mode is absent', () => {
  assertInjected(
    { mode: 'development', entry: './src.js' },
    {},
    'production',
  );
});

test('NODE_ENV development injects when higher-priority modes are absent', () => {
  assertInjected({ entry: './src.js' }, {}, 'development');
});
