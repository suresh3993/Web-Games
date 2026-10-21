import { expect, test } from '@playwright/test';

test('home page shows live catalog stats and featured games', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('browser games');
  await expect(page.getByText('Games in the catalog')).toBeVisible();
  // Honest availability: nothing is marked playable until the player ships.
  await expect(page.getByRole('region', { name: 'Featured' }).getByText('Coming soon').first()).toBeVisible();
});

test('browse, search and filter the catalog, then open a game', async ({ page }) => {
  await page.goto('/explore');
  await expect(page.getByText(/\d+ games/)).toBeVisible();

  await page.getByLabel('Search', { exact: true }).fill('sudoku');
  await expect(page).toHaveURL(/q=sudoku/);
  await expect(page.getByRole('link', { name: /Sudoku/ })).toBeVisible();

  await page.getByRole('link', { name: /Sudoku/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Sudoku' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'How to play' })).toBeVisible();
});

test('category filter narrows results and survives reload', async ({ page }) => {
  await page.goto('/categories');
  await page.getByRole('link', { name: /Word Games/ }).click();
  await expect(page).toHaveURL(/category=word/);
  await expect(page.getByRole('heading', { level: 1, name: 'Word Games' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Word Games' })).toBeVisible();
});

test('unknown routes and games show friendly 404s', async ({ page }) => {
  await page.goto('/this-page-does-not-exist');
  await expect(page.getByText('This level doesn’t exist')).toBeVisible();
  await page.goto('/games/not-a-real-game');
  await expect(page.getByText('Game not found')).toBeVisible();
});
