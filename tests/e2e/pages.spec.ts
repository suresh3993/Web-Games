import { expect, test } from '@playwright/test';
import { ADMIN_PAGES, login, PLAYER_PAGES, PUBLIC_PAGES, staffAccount, watchErrors } from './helpers';

/**
 * Visits every page and fails on uncaught errors or console errors. Run against the
 * production build (E2E_WEB_MODE=preview) this also catches Content-Security-Policy violations.
 */
async function visit(page: import('@playwright/test').Page, pages: [string, RegExp][]) {
  for (const [path, heading] of pages) {
    const problems = watchErrors(page);
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 }).first(), path).toHaveText(heading);
    await page.waitForLoadState('networkidle');
    expect(problems, `${path}\n${problems.join('\n')}`).toEqual([]);
    page.removeAllListeners('console');
    page.removeAllListeners('pageerror');
  }
}

test('public pages render without errors', async ({ page }) => {
  await visit(page, PUBLIC_PAGES);
});

test('account and admin pages render without errors', async ({ page }) => {
  const staff = staffAccount();
  test.skip(!staff, 'set E2E_STAFF_EMAIL / E2E_STAFF_PASSWORD (an admin account)');
  await login(page, staff!.email, staff!.password);
  await visit(page, [...PLAYER_PAGES, ...ADMIN_PAGES]);
  // A game's admin page and the player page with the result screen.
  await page.goto('/admin/games?q=snake');
  await page.getByRole('link', { name: /^(Edit|View)$/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Thumbnail' })).toBeVisible();
});
