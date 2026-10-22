import { expect, type Page } from '@playwright/test';
import { linkFromEmail, uniqueEmail } from './mailpit';

export const PASSWORD = 'correct horse battery staple';

/** Registers a fresh account and verifies it through the email in Mailpit. */
export async function registerVerified(page: Page, prefix: string, displayName = 'E2E Player'): Promise<string> {
  const email = uniqueEmail(prefix);
  await page.goto('/register');
  await page.getByLabel('Display name').fill(displayName);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();
  const link = await linkFromEmail(email, /verify your playverse email/i, 'verify-email');
  await page.goto(new URL(link).pathname + new URL(link).search);
  await expect(page.getByRole('heading', { name: 'Email verified' })).toBeVisible();
  return email;
}

export async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('button', { name: /account menu/i })).toBeVisible();
}

/** A published game with scores, preferring ones with simple controls. */
export async function publishedGame(page: Page): Promise<{ slug: string; title: string } | null> {
  const res = await page.request.get('/api/v1/games?status=PUBLISHED&pageSize=48&sort=title');
  const games = ((await res.json()) as { data: { slug: string; title: string; playable: boolean; supportsScores: boolean }[] }).data.filter((g) => g.playable && g.supportsScores);
  return games.find((g) => ['snake', 'brick-breaker', 'block-puzzle'].includes(g.slug)) ?? games[0] ?? null;
}

/** Collects uncaught page errors and console errors (CSP violations are console errors). */
export function watchErrors(page: Page): string[] {
  const problems: string[] = [];
  page.on('pageerror', (err) => problems.push(`page error: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(`console error: ${msg.text()}`);
  });
  return problems;
}

/** Every page with the heading it must show: public, signed-in player, and admin (staff). */
export const PUBLIC_PAGES: [string, RegExp][] = [
  ['/', /browser games/i],
  ['/explore', /games/i],
  ['/categories', /categories/i],
  ['/achievements', /Achievements/],
  ['/challenges', /Daily challenges/],
  ['/leaderboards', /Leaderboards/],
  ['/privacy', /Privacy policy/],
  ['/terms', /Terms of service/],
  ['/help', /Help and support/],
  ['/login', /Welcome back/],
  ['/register', /Create/],
  ['/forgot-password', /password/i],
];

export const PLAYER_PAGES: [string, RegExp][] = [
  ['/profile', /Your profile/],
  ['/profile/edit', /Edit profile/],
  ['/settings', /Settings/],
  ['/notifications', /Notifications/],
  ['/favorites', /Favourites/],
  ['/recently-played', /Recently played/],
];

export const ADMIN_PAGES: [string, RegExp][] = [
  ['/admin', /Dashboard/],
  ['/admin/users', /Users/],
  ['/admin/reports', /Reports & analytics/],
  ['/admin/games', /Games/],
  ['/admin/categories', /Categories/],
  ['/admin/achievements', /Achievements/],
  ['/admin/challenges', /Daily challenges/],
  ['/admin/audit-log', /Audit log/],
];

/** The staff account for admin-area tests, or null (those tests then skip). */
export function staffAccount(): { email: string; password: string } | null {
  const email = process.env.E2E_STAFF_EMAIL;
  const password = process.env.E2E_STAFF_PASSWORD;
  return email && password ? { email, password } : null;
}
