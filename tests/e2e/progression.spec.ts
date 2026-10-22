import { expect, test } from '@playwright/test';
import { publishedGame, registerVerified, login } from './helpers';

/**
 * Flow 8: unlock an achievement. A fresh account finishes its first counted round
 * (10 seconds or more) and unlocks "First Steps" (created by the seed).
 */
test('finishing a first round unlocks an achievement, with a notification', async ({ page }) => {
  test.setTimeout(120_000);
  const game = await publishedGame(page);
  test.skip(!game, 'no published game: run the smoke test and `npm run games:publish` first');
  const email = await registerVerified(page, 'achiever', 'Achiever');
  await login(page, email);

  await page.goto(`/games/${game!.slug}/play`);
  await page.getByRole('region', { name: 'Start' }).getByRole('button', { name: 'Play' }).click();
  const stage = page.getByTestId('game-stage');
  await expect(stage).toHaveAttribute('data-phase', 'running');
  // Rounds count toward achievements from 10 seconds of active play. Pausing stops that clock,
  // so keep the round running (games that end early, e.g. Snake, restart until the time is reached).
  const deadline = Date.now() + 11_500;
  while (Date.now() < deadline) {
    await page.waitForTimeout(500);
    if ((await stage.getAttribute('data-phase')) === 'finished') {
      await page.getByRole('region', { name: 'Round result' }).getByRole('button', { name: 'Play again' }).click();
      await expect(stage).toHaveAttribute('data-phase', 'running');
    }
  }
  if ((await stage.getAttribute('data-phase')) === 'running') {
    await page.getByRole('toolbar', { name: 'Game controls' }).getByRole('button', { name: 'End round' }).click();
  }
  await expect(stage).toHaveAttribute('data-phase', 'finished', { timeout: 15_000 });
  // The unlock may have come with an earlier round of this test; either way it is recorded.
  await page.goto('/achievements');
  await expect(page.getByLabel('First Steps, unlocked')).toBeVisible();

  await expect(page.getByRole('link', { name: /Notifications, \d+ unread/ })).toBeVisible();
  await page.goto('/notifications');
  await expect(page.getByText('Achievement unlocked: First Steps')).toBeVisible();
  await page.getByRole('button', { name: 'Mark all as read' }).click();
  await expect(page.getByRole('link', { name: 'Notifications', exact: true })).toBeVisible();

  await page.goto('/profile');
  await expect(page.getByText(/Level \d+/).first()).toBeVisible();
  await expect(page.getByText('First Steps')).toBeVisible();
});

test('daily challenges are listed for guests and players', async ({ page }) => {
  await page.goto('/challenges');
  await expect(page.getByRole('heading', { level: 1, name: 'Daily challenges' })).toBeVisible();
  await expect(page.getByText('Warm-up')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Log in to take part' })).toBeVisible();
});
