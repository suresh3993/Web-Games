import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ADMIN_PAGES, login, PLAYER_PAGES, PUBLIC_PAGES, publishedGame, staffAccount } from './helpers';

/**
 * Automated accessibility audit (axe-core, WCAG 2.2 A/AA rules) of every page in both themes.
 * Automated rules catch only part of real issues; keyboard and screen-reader passes are
 * still manual (see docs/ACCESSIBILITY.md).
 */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.use({ reducedMotion: 'reduce' });

async function audit(page: Page, paths: string[]) {
  const failures: string[] = [];
  for (const path of paths) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 }).first(), path).toBeVisible();
    await page.waitForLoadState('networkidle');
    const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    for (const v of violations) {
      const nodes = v.nodes.slice(0, 4).map((n) => `      ${n.target.join(' ')}  ${(n.failureSummary ?? '').split('\n').slice(1).join(' ').trim()}`);
      failures.push(`${path}: [${v.impact}] ${v.id}: ${v.help}\n${nodes.join('\n')}`);
    }
  }
  expect(failures, failures.join('\n')).toEqual([]);
}

for (const theme of ['dark', 'light'] as const) {
  test.describe(`${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((t) => window.localStorage.setItem('pv-theme', JSON.stringify({ state: { theme: t }, version: 0 })), theme);
    });

    test('public pages pass the automated accessibility audit', async ({ page }) => {
      const game = await publishedGame(page);
      const extra = game ? [`/games/${game.slug}`, `/games/${game.slug}/play`] : [];
      await audit(page, [...PUBLIC_PAGES.map(([path]) => path), ...extra, '/no-such-page']);
    });

    test('account and admin pages pass the automated accessibility audit', async ({ page }) => {
      const staff = staffAccount();
      test.skip(!staff, 'set E2E_STAFF_EMAIL / E2E_STAFF_PASSWORD (an admin account)');
      await login(page, staff!.email, staff!.password);
      const game = await publishedGame(page);
      const extra = game ? [`/games/${game.slug}/play`] : [];
      await audit(page, [...PLAYER_PAGES, ...ADMIN_PAGES].map(([path]) => path).concat(extra));
    });
  });
}
