import { expect, test } from '@playwright/test';
import { login, registerVerified } from './helpers';

/** Flow 10: unauthorized admin access is refused by the page and, more importantly, by the API. */
test('players cannot open the admin area or call admin APIs', async ({ page }) => {
  const email = await registerVerified(page, 'intruder', 'Curious Player');
  await login(page, email);
  await page.goto('/admin');
  await expect(page.getByText('You don’t have access to this page')).toBeVisible();
  await page.goto('/admin/users');
  await expect(page.getByText('You don’t have access to this page')).toBeVisible();

  const csrf = (await (await page.request.get('/api/v1/auth/csrf')).json()) as { data: { csrfToken: string } };
  const headers = { 'X-CSRF-Token': csrf.data.csrfToken };
  expect((await page.request.get('/api/v1/admin/dashboard')).status()).toBe(403);
  expect((await page.request.get('/api/v1/admin/users')).status()).toBe(403);
  const me = (await (await page.request.get('/api/v1/auth/me')).json()) as { data: { id: string } };
  const promote = await page.request.patch(`/api/v1/admin/users/${me.data.id}/role`, { data: { role: 'ADMIN' }, headers });
  expect(promote.status()).toBe(403);
  const after = (await (await page.request.get('/api/v1/auth/me')).json()) as { data: { role: string } };
  expect(after.data.role).toBe('USER');
});

test('staff can moderate: dashboard, users, reports and the audit log', async ({ page }) => {
  const email = process.env.E2E_STAFF_EMAIL;
  const password = process.env.E2E_STAFF_PASSWORD;
  test.skip(!email || !password, 'set E2E_STAFF_EMAIL / E2E_STAFF_PASSWORD (an admin account)');
  await login(page, email!, password!);

  await page.goto('/admin');
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  await expect(page.getByText('Registered users')).toBeVisible();
  await expect(page.getByText('Platform health')).toBeVisible();

  await page.getByRole('navigation', { name: 'Admin' }).getByRole('link', { name: 'Users' }).click();
  await page.getByLabel('Search users by email, name or ID').fill(email!);
  await page.getByLabel('Search users by email, name or ID').press('Enter');
  await expect(page.getByRole('table', { name: 'Users' }).getByText(email!)).toBeVisible();
  await page.getByRole('button', { name: 'Manage' }).first().click();
  await expect(page.getByText('You can’t change your own account here.')).toBeVisible();
  await page.keyboard.press('Escape');

  // A self-contained catalog change: create a category, then delete it.
  const slug = `e2e-${Date.now().toString(36)}`;
  await page.goto('/admin/categories');
  await page.getByRole('button', { name: 'New category' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Slug').fill(slug);
  await dialog.getByLabel('Name').fill('E2E Category');
  await dialog.getByLabel('Description').fill('Created by an end-to-end test.');
  await dialog.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('table', { name: 'Categories' }).getByText(slug)).toBeVisible();
  await page.getByRole('button', { name: 'Delete E2E Category' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('table', { name: 'Categories' }).getByText(slug)).toHaveCount(0);

  await page.goto(`/admin/audit-log?action=admin.category`);
  await expect(page.getByText('admin.category_deleted').first()).toBeVisible();

  await page.goto('/admin/reports');
  await expect(page.getByRole('heading', { name: 'Analytics', exact: true })).toBeVisible();
});
