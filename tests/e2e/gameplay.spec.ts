import { expect, test, type Page } from '@playwright/test';
import { linkFromEmail, uniqueEmail } from './mailpit';

/**
 * Player flows on a published game: launch → play → finish → result, then the score in
 * history and stats, favourites, and the leaderboard. Needs at least one published game
 * (see docs/GAME_PUBLISHING.md). Uses a fresh account verified through Mailpit, or an
 * existing verified account from E2E_PLAYER_EMAIL / E2E_PLAYER_PASSWORD.
 */
const PASSWORD = 'correct horse battery staple';
const PREFERRED = ['snake', 'brick-breaker', 'block-puzzle'];

async function publishedGame(page: Page): Promise<{ slug: string; title: string } | null> {
  const res = await page.request.get('/api/v1/games?status=PUBLISHED&pageSize=48&sort=title');
  const games = ((await res.json()) as { data: { slug: string; title: string; playable: boolean; supportsScores: boolean }[] }).data.filter(
    (g) => g.playable && g.supportsScores,
  );
  return games.find((g) => PREFERRED.includes(g.slug)) ?? games[0] ?? null;
}

async function signIn(page: Page) {
  let email = process.env.E2E_PLAYER_EMAIL;
  let password = process.env.E2E_PLAYER_PASSWORD;
  if (!email || !password) {
    email = uniqueEmail('player');
    password = PASSWORD;
    await page.goto('/register');
    await page.getByLabel('Display name').fill('E2E Gamer');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Create account' }).click();
    const link = await linkFromEmail(email, /verify your playverse email/i, 'verify-email');
    await page.goto(new URL(link).pathname + new URL(link).search);
    await expect(page.getByRole('heading', { name: 'Email verified' })).toBeVisible();
  }
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('button', { name: /account menu/i })).toBeVisible();
}

test('guests are asked to log in before launching a game', async ({ page }) => {
  const game = await publishedGame(page);
  test.skip(!game, 'no published game: run the smoke test and `npm run games:publish` first');
  await page.goto(`/games/${game!.slug}/play`);
  await expect(page.getByRole('heading', { name: `Log in to play ${game!.title}` })).toBeVisible();
  // The API refuses too, not just the UI.
  const csrf = await (await page.request.get('/api/v1/auth/csrf')).json();
  const res = await page.request.post('/api/v1/game-sessions', {
    data: { slug: game!.slug },
    headers: { 'X-CSRF-Token': csrf.data.csrfToken },
  });
  expect(res.status()).toBe(401);
});

test('launch, play and finish a game; the result shows up in stats, history, favourites and leaderboards', async ({ page }) => {
  const game = await publishedGame(page);
  test.skip(!game, 'no published game: run the smoke test and `npm run games:publish` first');
  await signIn(page);

  const before = (await (await page.request.get(`/api/v1/games/${game!.slug}/me`)).json()).data as { plays: number };

  // Details page → player.
  await page.goto(`/games/${game!.slug}`);
  await page.getByRole('link', { name: 'Play now', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/games/${game!.slug}/play$`));
  const stage = page.getByTestId('game-stage');
  await page.getByRole('region', { name: 'Start' }).getByRole('button', { name: 'Play' }).click();
  await expect(stage).toHaveAttribute('data-phase', 'running');

  // Play a little: pause/resume through the toolbar, some input, then end the round.
  const toolbar = page.getByRole('toolbar', { name: 'Game controls' });
  await toolbar.getByRole('button', { name: 'Pause' }).click();
  await expect(stage).toHaveAttribute('data-phase', 'paused');
  await page.getByRole('region', { name: 'Paused' }).getByRole('button', { name: 'Resume' }).click();
  await expect(stage).toHaveAttribute('data-phase', 'running');
  for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Space']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(150);
  }
  if ((await stage.getAttribute('data-phase')) === 'running') {
    await toolbar.getByRole('button', { name: 'End round' }).click({ timeout: 5_000 }).catch(() => undefined);
  }
  await expect(stage).toHaveAttribute('data-phase', 'finished', { timeout: 15_000 });
  const result = page.getByTestId('round-result');
  await expect(result).toBeVisible();
  await expect(result).toContainText(/\+\d+ XP/);
  await expect(result).not.toContainText('was not saved');

  // The round counts: personal stats and history.
  const after = (await (await page.request.get(`/api/v1/games/${game!.slug}/me`)).json()).data as { plays: number };
  expect(after.plays).toBe(before.plays + 1);
  await page.goto('/recently-played');
  await expect(page.getByRole('link', { name: game!.title, exact: true })).toBeVisible();

  // Favourites: add on the details page, see it listed, remove it again.
  // The heart flips optimistically, so wait for the API to confirm before leaving the page.
  const saved = (method: 'POST' | 'DELETE') =>
    page.waitForResponse((r) => r.url().endsWith(`/games/${game!.slug}/favorite`) && r.request().method() === method);
  await page.goto(`/games/${game!.slug}`);
  const favourite = page.getByRole('button', { name: /^Favourite/ });
  await expect(favourite).toBeEnabled();
  if ((await favourite.getAttribute('aria-pressed')) === 'true') await favourite.click();
  await expect(favourite).toHaveAttribute('aria-pressed', 'false');
  const added = saved('POST');
  await favourite.click();
  await expect(favourite).toHaveAttribute('aria-pressed', 'true');
  expect((await added).ok()).toBe(true);
  await page.goto('/favorites');
  await expect(page.getByRole('link', { name: new RegExp(game!.title) }).first()).toBeVisible();
  await page.goto(`/games/${game!.slug}`);
  const removed = saved('DELETE');
  await page.getByRole('button', { name: /^Favourite/ }).click();
  await expect(page.getByRole('button', { name: /^Favourite/ })).toHaveAttribute('aria-pressed', 'false');
  expect((await removed).ok()).toBe(true);

  // Leaderboards: the per-game board and the global XP board render for this player.
  await expect(page.getByRole('heading', { name: 'Leaderboard' })).toBeVisible();
  await page.goto('/leaderboards');
  await expect(page.getByRole('heading', { level: 1, name: 'Leaderboards' })).toBeVisible();
});

test('leaving mid-round asks first and still saves the round', async ({ page }) => {
  const game = await publishedGame(page);
  test.skip(!game, 'no published game: run the smoke test and `npm run games:publish` first');
  await signIn(page);
  const before = (await (await page.request.get(`/api/v1/games/${game!.slug}/me`)).json()).data as { plays: number };

  await page.goto(`/games/${game!.slug}/play`);
  await page.getByRole('region', { name: 'Start' }).getByRole('button', { name: 'Play' }).click();
  await expect(page.getByTestId('game-stage')).toHaveAttribute('data-phase', 'running');

  await page.getByRole('link', { name: 'Explore' }).first().click();
  await expect(page.getByRole('heading', { name: 'Leave this game?' })).toBeVisible();
  await page.getByRole('button', { name: 'Leave game' }).click();
  await expect(page).toHaveURL(/\/explore/);
  await expect
    .poll(async () => ((await (await page.request.get(`/api/v1/games/${game!.slug}/me`)).json()).data as { plays: number }).plays)
    .toBe(before.plays + 1);
});
