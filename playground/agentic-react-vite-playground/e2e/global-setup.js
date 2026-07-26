import { mkdirSync, rmSync } from 'node:fs';

export default function globalSetup() {
  const settingsRoot = process.env.AGENTIC_REACT_E2E_SETTINGS_ROOT;
  if (!settingsRoot) {
    throw new Error('The Vite E2E settings root must be isolated.');
  }

  rmSync(settingsRoot, { force: true, recursive: true });
  mkdirSync(settingsRoot, { recursive: true });

  return () => {
    rmSync(settingsRoot, { force: true, recursive: true });
  };
}
