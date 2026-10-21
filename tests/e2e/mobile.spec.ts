import { expect, test } from '@playwright/test';

test('mobile navigation menu opens, navigates and closes', async ({ page }) => {
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Open menu' });
  await expect(toggle).toBeVisible();
  await toggle.click();
  // The toggle's accessible name changes with its state.
  await expect(page.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('navigation', { name: 'Mobile' }).getByRole('link', { name: 'Explore' }).click();
  await expect(page).toHaveURL(/\/explore/);
  await expect(page.getByRole('navigation', { name: 'Mobile' })).toBeHidden();
});

test('catalog has no horizontal overflow on a phone', async ({ page }) => {
  await page.goto('/explore');
  await expect(page.getByText(/\d+ games/)).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
