import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { WebSocket } from 'ws';
import { RuntimeBridgeServer } from '../dist/bridge/server.js';
import {
  createAgenticReactSettingsEngine,
  NodeSettingsStore,
} from '../dist/core/settings/node.js';

const createSettingsRoot = () =>
  fs.mkdtempSync(path.join(os.tmpdir(), 'agentic-react-settings-'));

const cleanup = (directory) =>
  fs.rmSync(directory, { recursive: true, force: true });

const readSettingsJson = (settingsRoot) =>
  JSON.parse(fs.readFileSync(path.join(settingsRoot, 'settings.json'), 'utf8'));

const pngBytes = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]);

const otherPngBytes = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01,
]);

const webpBytes = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

const createSettingsCommitFailingFileSystem = () => ({
  mkdirSync: fs.mkdirSync.bind(fs),
  readFileSync: fs.readFileSync.bind(fs),
  renameSync: (source, target) => {
    if (path.basename(String(target)) === 'settings.json') {
      throw new Error('settings commit failed');
    }
    fs.renameSync(source, target);
  },
  rmSync: fs.rmSync.bind(fs),
  writeFileSync: fs.writeFileSync.bind(fs),
});

const requestSettingsRpc = async ({ address, id, event, payload }) =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(
      `ws://127.0.0.1:${address.port}/__agentic_react_bridge`,
    );
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error('Timed out waiting for settings RPC response'));
    }, 5000);

    socket.on('open', () => {
      socket.send(
        JSON.stringify({
          type: 'bridge:request',
          id,
          event,
          payload,
        }),
      );
    });
    socket.on('message', (message) => {
      clearTimeout(timeout);
      socket.close();
      resolve(JSON.parse(message.toString()));
    });
    socket.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });

test('store path override keeps settings under injected root', () => {
  const settingsRoot = createSettingsRoot();
  try {
    const store = new NodeSettingsStore({ settingsRoot });
    const result = store.updateShortcuts({ singleSelect: 'Ctrl+1' });

    assert.equal(result.success, true);
    assert.equal(store.getSettingsRootForTests(), settingsRoot);
    assert.equal(
      store.getSettingsFilePathForTests(),
      path.join(settingsRoot, 'settings.json'),
    );
    assert.equal(fs.existsSync(path.join(settingsRoot, 'settings.json')), true);
  } finally {
    cleanup(settingsRoot);
  }
});

test('effective settings merge global over project over package defaults', () => {
  const settingsRoot = createSettingsRoot();
  try {
    fs.mkdirSync(settingsRoot, { recursive: true });
    fs.writeFileSync(
      path.join(settingsRoot, 'settings.json'),
      JSON.stringify({
        schemaVersion: 1,
        shortcuts: {
          singleSelect: 'Ctrl+G',
        },
      }),
    );

    const store = new NodeSettingsStore({
      settingsRoot,
      projectToolkitConfig: {
        settings: {
          shortcuts: {
            singleSelect: 'Ctrl+P',
            multiSelect: 'Shift+M',
          },
        },
      },
    });
    const snapshot = store.getSnapshot();

    assert.equal(snapshot.effectiveSettings.shortcuts.singleSelect, 'Ctrl+G');
    assert.equal(snapshot.sources.shortcuts.singleSelect, 'global');
    assert.equal(snapshot.effectiveSettings.shortcuts.multiSelect, 'Shift+M');
    assert.equal(snapshot.sources.shortcuts.multiSelect, 'project');
    assert.equal(
      snapshot.effectiveSettings.shortcuts.toggleToolbox,
      'Ctrl+Alt+Shift+A',
    );
    assert.equal(snapshot.effectiveSettings.shortcuts.done, 'Enter');
    assert.equal(snapshot.sources.shortcuts.done, 'package');
  } finally {
    cleanup(settingsRoot);
  }
});

test('corrupt settings file falls back with structured errors', () => {
  const settingsRoot = createSettingsRoot();
  try {
    fs.mkdirSync(settingsRoot, { recursive: true });
    fs.writeFileSync(path.join(settingsRoot, 'settings.json'), '{bad json');

    const snapshot = new NodeSettingsStore({ settingsRoot }).getSnapshot();

    assert.equal(snapshot.effectiveSettings.shortcuts.done, 'Enter');
    assert.equal(
      snapshot.effectiveSettings.shortcuts.singleSelect,
      'Ctrl+Alt+Shift+S',
    );
    assert.equal(snapshot.errors[0].code, 'invalid_settings');
  } finally {
    cleanup(settingsRoot);
  }
});

test('shortcut updates are persisted without temp leftovers', () => {
  const settingsRoot = createSettingsRoot();
  try {
    const store = new NodeSettingsStore({ settingsRoot });
    const result = store.updateShortcuts({
      singleSelect: 'Ctrl+S',
      done: 'Ctrl+Enter',
    });

    assert.equal(result.success, true);
    assert.deepEqual(readSettingsJson(settingsRoot).shortcuts, {
      singleSelect: 'Ctrl+S',
      done: 'Ctrl+Enter',
    });
    assert.equal(
      fs.readdirSync(settingsRoot).some((entry) => entry.endsWith('.tmp')),
      false,
    );
  } finally {
    cleanup(settingsRoot);
  }
});

test('shortcut writes normalize valid values and reject unsafe or duplicate sets', () => {
  const settingsRoot = createSettingsRoot();
  try {
    const store = new NodeSettingsStore({ settingsRoot });
    const normalizedResult = store.updateShortcuts({
      singleSelect: 'shift + ctrl + 1',
    });
    assert.equal(normalizedResult.success, true);
    assert.equal(
      readSettingsJson(settingsRoot).shortcuts.singleSelect,
      'Ctrl+Shift+1',
    );
    const committedSettings = readSettingsJson(settingsRoot);

    for (const shortcut of ['Escape', 'Ctrl+Escape', 'Shift', 'Ctrl+Private']) {
      const result = store.updateShortcuts({ singleSelect: shortcut });
      assert.equal(result.success, false);
      assert.equal(result.error.code, 'invalid_payload');
      assert.deepEqual(readSettingsJson(settingsRoot), committedSettings);
    }

    const duplicateResult = store.updateShortcuts({
      singleSelect: 'Enter',
    });
    assert.equal(duplicateResult.success, false);
    assert.equal(duplicateResult.error.code, 'invalid_payload');
    assert.match(duplicateResult.error.message, /already assigned/i);
    assert.deepEqual(readSettingsJson(settingsRoot), committedSettings);
  } finally {
    cleanup(settingsRoot);
  }
});

test('shortcut writes reject duplicates after merging project defaults', () => {
  const settingsRoot = createSettingsRoot();
  try {
    const store = new NodeSettingsStore({
      settingsRoot,
      projectToolkitConfig: {
        settings: { shortcuts: { multiSelect: 'Ctrl+P' } },
      },
    });

    const result = store.updateShortcuts({ singleSelect: 'ctrl+p' });
    assert.equal(result.success, false);
    assert.equal(result.error.code, 'invalid_payload');
    assert.equal(fs.existsSync(path.join(settingsRoot, 'settings.json')), false);
  } finally {
    cleanup(settingsRoot);
  }
});

test('single shortcut reset reveals project or package defaults', () => {
  const settingsRoot = createSettingsRoot();
  try {
    const store = new NodeSettingsStore({
      settingsRoot,
      projectToolkitConfig: {
        settings: {
          shortcuts: {
            singleSelect: 'Ctrl+P',
          },
        },
      },
    });
    const updateResult = store.updateShortcuts({
      singleSelect: 'Ctrl+G',
      multiSelect: 'Ctrl+M',
    });
    assert.equal(updateResult.success, true);

    const singleResetResult = store.resetShortcut('singleSelect');
    assert.equal(singleResetResult.success, true);
    assert.equal(
      singleResetResult.effectiveSettings.shortcuts.singleSelect,
      'Ctrl+P',
    );
    assert.equal(singleResetResult.sources.shortcuts.singleSelect, 'project');
    assert.equal(
      singleResetResult.effectiveSettings.shortcuts.multiSelect,
      'Ctrl+M',
    );
    assert.deepEqual(readSettingsJson(settingsRoot).shortcuts, {
      multiSelect: 'Ctrl+M',
    });

    const multiResetResult = store.resetShortcut('multiSelect');
    assert.equal(multiResetResult.success, true);
    assert.equal(
      multiResetResult.effectiveSettings.shortcuts.multiSelect,
      'Ctrl+Alt+Shift+M',
    );
    assert.equal(multiResetResult.sources.shortcuts.multiSelect, 'package');
    assert.equal(
      Object.hasOwn(readSettingsJson(settingsRoot), 'shortcuts'),
      false,
    );
  } finally {
    cleanup(settingsRoot);
  }
});

test('icon validation, apply, and reset use fixed files only', () => {
  const settingsRoot = createSettingsRoot();
  try {
    const store = new NodeSettingsStore({ settingsRoot });
    const invalidResult = store.applyIcon({
      mime: 'image/png',
      data: Buffer.from('not a png').toString('base64'),
    });

    assert.equal(invalidResult.success, false);
    assert.equal(invalidResult.error.code, 'invalid_payload');

    const applyResult = store.applyIcon({
      mime: 'image/png',
      data: pngBytes.toString('base64'),
    });

    assert.equal(applyResult.success, true);
    assert.equal(
      applyResult.effectiveSettings.appearance.toolboxIcon.filename,
      'toolbox-icon.png',
    );
    assert.equal(
      applyResult.effectiveSettings.appearance.toolboxIconUrl,
      `data:image/png;base64,${pngBytes.toString('base64')}`,
    );
    assert.equal(fs.existsSync(path.join(settingsRoot, 'toolbox-icon.png')), true);
    assert.equal(
      fs.existsSync(path.join(settingsRoot, 'toolbox-icon.webp')),
      false,
    );

    const resetResult = store.resetIcon();

    assert.equal(resetResult.success, true);
    assert.equal(resetResult.effectiveSettings.appearance.toolboxIcon, null);
    assert.equal(fs.existsSync(path.join(settingsRoot, 'toolbox-icon.png')), false);
  } finally {
    cleanup(settingsRoot);
  }
});

test('global icon resolves after reload and takes precedence over project iconUrl', () => {
  const settingsRoot = createSettingsRoot();
  try {
    const projectIconUrl = '/agentic-react-project-icon.png';
    const store = new NodeSettingsStore({
      settingsRoot,
      projectToolkitConfig: {
        iconUrl: projectIconUrl,
      },
    });

    const projectSnapshot = store.getSnapshot();
    assert.equal(
      projectSnapshot.effectiveSettings.appearance.toolboxIcon,
      null,
    );
    assert.equal(
      projectSnapshot.effectiveSettings.appearance.toolboxIconUrl,
      projectIconUrl,
    );
    assert.equal(projectSnapshot.sources.appearance.toolboxIcon, 'project');

    const applyResult = store.applyIcon({
      mime: 'image/png',
      data: pngBytes.toString('base64'),
    });
    assert.equal(applyResult.success, true);

    const reloadedSnapshot = new NodeSettingsStore({
      settingsRoot,
      projectToolkitConfig: {
        iconUrl: projectIconUrl,
      },
    }).getSnapshot();

    assert.equal(reloadedSnapshot.sources.appearance.toolboxIcon, 'global');
    assert.equal(
      reloadedSnapshot.effectiveSettings.appearance.toolboxIcon.filename,
      'toolbox-icon.png',
    );
    assert.equal(
      reloadedSnapshot.effectiveSettings.appearance.toolboxIconUrl,
      `data:image/png;base64,${pngBytes.toString('base64')}`,
    );
  } finally {
    cleanup(settingsRoot);
  }
});

test('project iconUrl fallback omits local home paths from snapshots', () => {
  const settingsRoot = createSettingsRoot();
  try {
    const snapshot = new NodeSettingsStore({
      settingsRoot,
      projectToolkitConfig: {
        iconUrl: '/Users/example/private-icon.png',
      },
    }).getSnapshot();

    assert.equal(snapshot.sources.appearance.toolboxIcon, 'package');
    assert.equal(snapshot.effectiveSettings.appearance.toolboxIconUrl, null);
  } finally {
    cleanup(settingsRoot);
  }
});

test('missing or corrupt global icons fall back without exposing broken global data', () => {
  const settingsRoot = createSettingsRoot();
  try {
    fs.mkdirSync(settingsRoot, { recursive: true });
    fs.writeFileSync(
      path.join(settingsRoot, 'settings.json'),
      JSON.stringify({
        schemaVersion: 1,
        appearance: {
          toolboxIcon: {
            filename: 'toolbox-icon.png',
            mime: 'image/png',
            updatedAt: Date.now(),
          },
        },
      }),
    );

    const missingSnapshot = new NodeSettingsStore({
      settingsRoot,
      projectToolkitConfig: {
        iconUrl: '/project-icon.png',
      },
    }).getSnapshot();

    assert.equal(missingSnapshot.sources.appearance.toolboxIcon, 'project');
    assert.equal(
      missingSnapshot.effectiveSettings.appearance.toolboxIcon,
      null,
    );
    assert.equal(
      missingSnapshot.effectiveSettings.appearance.toolboxIconUrl,
      '/project-icon.png',
    );
    assert.equal(missingSnapshot.errors[0].code, 'invalid_settings');
    assert.equal(missingSnapshot.errors[0].detail, 'toolbox-icon.png');

    fs.writeFileSync(path.join(settingsRoot, 'toolbox-icon.png'), 'not a png');
    const corruptSnapshot = new NodeSettingsStore({ settingsRoot }).getSnapshot();

    assert.equal(corruptSnapshot.sources.appearance.toolboxIcon, 'package');
    assert.equal(corruptSnapshot.effectiveSettings.appearance.toolboxIcon, null);
    assert.equal(
      corruptSnapshot.effectiveSettings.appearance.toolboxIconUrl,
      null,
    );
    assert.equal(corruptSnapshot.errors[0].code, 'invalid_settings');
  } finally {
    cleanup(settingsRoot);
  }
});

test('icon apply preserves committed state when metadata write fails', () => {
  const settingsRoot = createSettingsRoot();
  try {
    const store = new NodeSettingsStore({ settingsRoot });
    const initialResult = store.applyIcon({
      mime: 'image/webp',
      data: webpBytes.toString('base64'),
    });
    assert.equal(initialResult.success, true);
    const committedSettings = readSettingsJson(settingsRoot);

    const failingStore = new NodeSettingsStore({
      settingsRoot,
      fileSystem: createSettingsCommitFailingFileSystem(),
    });
    const failedResult = failingStore.applyIcon({
      mime: 'image/png',
      data: pngBytes.toString('base64'),
    });

    assert.equal(failedResult.success, false);
    assert.equal(failedResult.error.code, 'write_failed');
    assert.deepEqual(readSettingsJson(settingsRoot), committedSettings);
    assert.equal(fs.existsSync(path.join(settingsRoot, 'toolbox-icon.png')), false);
    assert.deepEqual(
      fs.readFileSync(path.join(settingsRoot, 'toolbox-icon.webp')),
      webpBytes,
    );
    assert.equal(
      failedResult.effectiveSettings.appearance.toolboxIcon.filename,
      'toolbox-icon.webp',
    );
    assert.equal(
      failedResult.effectiveSettings.appearance.toolboxIconUrl,
      `data:image/webp;base64,${webpBytes.toString('base64')}`,
    );
  } finally {
    cleanup(settingsRoot);
  }
});

test('icon apply restores previous bytes on same-target metadata write failure', () => {
  const settingsRoot = createSettingsRoot();
  try {
    const store = new NodeSettingsStore({ settingsRoot });
    assert.equal(
      store.applyIcon({
        mime: 'image/png',
        data: pngBytes.toString('base64'),
      }).success,
      true,
    );

    const failingStore = new NodeSettingsStore({
      settingsRoot,
      fileSystem: createSettingsCommitFailingFileSystem(),
    });
    const failedResult = failingStore.applyIcon({
      mime: 'image/png',
      data: otherPngBytes.toString('base64'),
    });

    assert.equal(failedResult.success, false);
    assert.deepEqual(
      fs.readFileSync(path.join(settingsRoot, 'toolbox-icon.png')),
      pngBytes,
    );
    assert.equal(
      failedResult.effectiveSettings.appearance.toolboxIconUrl,
      `data:image/png;base64,${pngBytes.toString('base64')}`,
    );
  } finally {
    cleanup(settingsRoot);
  }
});

test('icon reset preserves committed files when metadata write fails', () => {
  const settingsRoot = createSettingsRoot();
  try {
    const store = new NodeSettingsStore({ settingsRoot });
    assert.equal(
      store.applyIcon({
        mime: 'image/png',
        data: pngBytes.toString('base64'),
      }).success,
      true,
    );
    const committedSettings = readSettingsJson(settingsRoot);

    const failingStore = new NodeSettingsStore({
      settingsRoot,
      fileSystem: createSettingsCommitFailingFileSystem(),
    });
    const failedResult = failingStore.resetIcon();

    assert.equal(failedResult.success, false);
    assert.equal(failedResult.error.code, 'write_failed');
    assert.deepEqual(readSettingsJson(settingsRoot), committedSettings);
    assert.deepEqual(
      fs.readFileSync(path.join(settingsRoot, 'toolbox-icon.png')),
      pngBytes,
    );
  } finally {
    cleanup(settingsRoot);
  }
});

test('bridge supports browser to Node settings RPC on the existing socket', async () => {
  const settingsRoot = createSettingsRoot();
  const httpServer = http.createServer();
  const runtimeBridge = new RuntimeBridgeServer();
  const settingsEngine = createAgenticReactSettingsEngine({ settingsRoot });
  runtimeBridge.attach(httpServer);
  settingsEngine.registerBridge(runtimeBridge);

  try {
    await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const address = httpServer.address();
    assert.equal(typeof address, 'object');

    const response = await requestSettingsRpc({
      address,
      id: 'settings-rpc-1',
      event: 'settings:update-shortcuts',
      payload: {
        token: settingsEngine.token,
        shortcuts: {
          singleSelect: 'Ctrl+B',
        },
      },
    });

    assert.equal(response.type, 'bridge:response');
    assert.equal(response.id, 'settings-rpc-1');
    assert.equal(response.ok, true);
    assert.equal(response.payload.success, true);
    assert.equal(
      response.payload.effectiveSettings.shortcuts.singleSelect,
      'Ctrl+B',
    );
  } finally {
    await new Promise((resolve) => httpServer.close(resolve));
    cleanup(settingsRoot);
  }
});

test('bridge rejects invalid and duplicate shortcut updates', async () => {
  const settingsRoot = createSettingsRoot();
  const httpServer = http.createServer();
  const runtimeBridge = new RuntimeBridgeServer();
  const settingsEngine = createAgenticReactSettingsEngine({ settingsRoot });
  runtimeBridge.attach(httpServer);
  settingsEngine.registerBridge(runtimeBridge);

  try {
    await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const address = httpServer.address();
    assert.equal(typeof address, 'object');

    for (const [id, shortcut] of [
      ['settings-rpc-reserved', 'Escape'],
      ['settings-rpc-duplicate', 'Enter'],
    ]) {
      const response = await requestSettingsRpc({
        address,
        id,
        event: 'settings:update-shortcuts',
        payload: {
          token: settingsEngine.token,
          shortcuts: { singleSelect: shortcut },
        },
      });
      assert.equal(response.ok, true);
      assert.equal(response.payload.success, false);
      assert.equal(response.payload.error.code, 'invalid_payload');
    }
    assert.equal(fs.existsSync(path.join(settingsRoot, 'settings.json')), false);
  } finally {
    await new Promise((resolve) => httpServer.close(resolve));
    cleanup(settingsRoot);
  }
});

test('bridge settings RPC authorization failures do not disclose global settings', async () => {
  const settingsRoot = createSettingsRoot();
  const httpServer = http.createServer();
  const runtimeBridge = new RuntimeBridgeServer();
  const settingsEngine = createAgenticReactSettingsEngine({ settingsRoot });
  runtimeBridge.attach(httpServer);
  settingsEngine.registerBridge(runtimeBridge);

  try {
    fs.mkdirSync(settingsRoot, { recursive: true });
    fs.writeFileSync(
      path.join(settingsRoot, 'settings.json'),
      JSON.stringify({
        schemaVersion: 1,
        shortcuts: {
          singleSelect: 'Ctrl+Private',
          multiSelect: 'Ctrl+Alt+Private',
        },
      }),
    );

    await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const address = httpServer.address();
    assert.equal(typeof address, 'object');

    for (const [id, payload] of [
      ['settings-rpc-missing-token', {}],
      ['settings-rpc-bad-token', { token: 'bad-token' }],
    ]) {
      const response = await requestSettingsRpc({
        address,
        id,
        event: 'settings:get-effective',
        payload,
      });

      assert.equal(response.type, 'bridge:response');
      assert.equal(response.id, id);
      assert.equal(response.ok, true);
      assert.equal(response.payload.success, false);
      assert.equal(response.payload.error.code, 'unauthorized');
      assert.equal(
        response.payload.effectiveSettings.shortcuts.singleSelect,
        'Ctrl+Alt+Shift+S',
      );
      assert.equal(
        response.payload.effectiveSettings.shortcuts.multiSelect,
        'Ctrl+Alt+Shift+M',
      );
      assert.equal(
        response.payload.effectiveSettings.appearance.toolboxIconUrl,
        null,
      );
      assert.equal(response.payload.sources.shortcuts.singleSelect, 'package');
    }
  } finally {
    await new Promise((resolve) => httpServer.close(resolve));
    cleanup(settingsRoot);
  }
});
