import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test as setup } from '@playwright/test';
import { RESULTS_DIR, RUN_FILE, STAFF_STATE, type SmokeRun } from './paths';

/**
 * Logs in once as a staff account (moderator/admin) so the smoke test can launch
 * unpublished games in preview mode, and starts a fresh result set for this run.
 */
setup('log in as staff and start a new smoke run', async ({ page, baseURL }) => {
  const email = process.env.E2E_STAFF_EMAIL;
  const password = process.env.E2E_STAFF_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'Set E2E_STAFF_EMAIL and E2E_STAFF_PASSWORD to a verified moderator or admin account ' +
        '(for example the account provisioned by SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD).',
    );
  }

  const webMode = process.env.E2E_WEB_MODE === 'preview' ? 'production build' : 'dev server';
  if (webMode === 'production build') {
    // Make sure the run really exercises the production Content-Security-Policy.
    const res = await page.request.get('/');
    expect(res.headers()['content-security-policy'], 'production CSP header').toContain("script-src 'self'");
  }

  rmSync(RESULTS_DIR, { recursive: true, force: true });
  mkdirSync(RESULTS_DIR, { recursive: true });
  const run: SmokeRun = { runId: randomUUID(), startedAt: new Date().toISOString(), baseURL: baseURL ?? '', webMode };
  writeFileSync(RUN_FILE, JSON.stringify(run, null, 2));

  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  const menu = page.getByRole('button', { name: /account menu/i });
  await expect(menu).toBeVisible();

  // Previewing unpublished games needs a staff role; fail early with a clear message otherwise.
  const me = await page.request.get('/api/v1/auth/me');
  const role = ((await me.json()) as { data: { role: string } }).data.role;
  expect(role, 'E2E staff account must be a MODERATOR or ADMIN').not.toBe('USER');

  mkdirSync(path.dirname(STAFF_STATE), { recursive: true });
  await page.context().storageState({ path: STAFF_STATE });
});
