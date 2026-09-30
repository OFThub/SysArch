import { defineConfig, devices } from '@playwright/test';
import { mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The e2e stack runs beside dev: its own ports, database and secret. */
export const E2E = {
  tmp: fileURLToPath(new URL('./e2e/.tmp/', import.meta.url)),
  api: 8788,
  web: 5174,
  secret: 'e2e-secret-with-at-least-thirty-two-chars',
};
export const e2eEnv = {
  PORT: E2E.api,
  DATABASE_PATH: `${E2E.tmp}e2e.db`,
  BETTER_AUTH_SECRET: E2E.secret,
  BETTER_AUTH_URL: `http://localhost:${E2E.web}`,
  WEB_ORIGIN: `http://localhost:${E2E.web}`,
};

// A fresh database per run. Workers load this file too, so only the main
// process may wipe it.
if (!process.env.TEST_WORKER_INDEX) {
  rmSync(E2E.tmp, { recursive: true, force: true });
  mkdirSync(E2E.tmp, { recursive: true });
}

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${E2E.web}`,
    storageState: `${E2E.tmp}session.json`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: [
    {
      command: 'node --import tsx src/index.ts',
      cwd: 'apps/server',
      port: E2E.api,
      env: Object.fromEntries(Object.entries(e2eEnv).map(([k, v]) => [k, String(v)])),
      reuseExistingServer: false,
    },
    {
      command: `node node_modules/vite/bin/vite.js --port ${E2E.web} --strictPort`,
      cwd: 'apps/web',
      port: E2E.web,
      env: { SYSARCH_API: `http://localhost:${E2E.api}` },
      reuseExistingServer: false,
    },
  ],
});
