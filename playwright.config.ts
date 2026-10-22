import { defineConfig, devices } from '@playwright/test';
import { STAFF_STATE } from './tests/e2e/smoke/paths';

// Ports are overridable so E2E runs can avoid servers already bound to the defaults.
const webPort = Number(process.env.E2E_WEB_PORT ?? 5173);
const apiPort = Number(process.env.E2E_API_PORT ?? 4000);
// E2E_WEB_MODE=preview tests the production build (minified, with the production CSP) instead of the dev server.
const previewBuild = process.env.E2E_WEB_MODE === 'preview';

/**
 * End-to-end tests against the real stack (Postgres, Redis, Mailpit, API, web).
 * Prerequisites: `npm run infra:up`, migrated + seeded database.
 *
 *   npm run test:e2e         user flows (desktop + mobile)
 *   npm run test:e2e:games   launch-flow smoke test of every game (needs a staff account,
 *                            see docs/GAME_PUBLISHING.md), then `npm run games:publish`
 *
 * Starts the dev servers unless they are already running.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${webPort}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: [/mobile\.spec\.ts/, /smoke\//] },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.ts/ },
    { name: 'games-smoke-setup', testMatch: /smoke\/games-smoke\.setup\.ts/ },
    {
      name: 'games-smoke',
      testMatch: /smoke\/games-smoke\.spec\.ts/,
      dependencies: ['games-smoke-setup'],
      // No retries: a game that needs a retry to pass is not ready to publish.
      retries: 0,
      use: { ...devices['Desktop Chrome'], storageState: STAFF_STATE },
    },
    {
      name: 'games-smoke-mobile',
      testMatch: /smoke\/games-smoke\.spec\.ts/,
      dependencies: ['games-smoke-setup'],
      retries: 0,
      use: { ...devices['Pixel 7'], storageState: STAFF_STATE },
    },
  ],
  // Started (and stopped afterwards) unless already running; skipped for a remote E2E_BASE_URL.
  // Plain `node` commands (no npm or watch wrappers) so stopping the server stops the whole process.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: 'node --import tsx src/server.ts',
          cwd: 'apps/api',
          url: `http://localhost:${apiPort}/api/v1/health`,
          env: { API_PORT: String(apiPort) },
          reuseExistingServer: true,
          timeout: 120_000,
        },
        {
          command: previewBuild
            ? `node ../../node_modules/vite/bin/vite.js build && node ../../node_modules/vite/bin/vite.js preview --port ${webPort} --strictPort`
            : `node ../../node_modules/vite/bin/vite.js --port ${webPort} --strictPort`,
          cwd: 'apps/web',
          url: `http://localhost:${webPort}`,
          env: { API_PROXY_TARGET: `http://localhost:${apiPort}` },
          reuseExistingServer: true,
          timeout: previewBuild ? 300_000 : 120_000,
        },
      ],
});
