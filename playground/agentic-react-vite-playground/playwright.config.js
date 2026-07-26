import { defineConfig, devices } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const settingsRoot = mkdtempSync(
  path.join(os.tmpdir(), 'agentic-react-vite-e2e-settings-'),
);
process.env.AGENTIC_REACT_E2E_SETTINGS_ROOT = settingsRoot;

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.js',
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  use: {
    baseURL: 'http://127.0.0.1:51423',
    permissions: ['clipboard-read', 'clipboard-write'],
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm dev --host 127.0.0.1',
    url: 'http://127.0.0.1:51423',
    reuseExistingServer: false,
    timeout: 30000,
    env: {
      AGENTIC_REACT_E2E_SETTINGS_ROOT: settingsRoot,
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
