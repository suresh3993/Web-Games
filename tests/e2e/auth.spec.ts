import { expect, test, type Page } from '@playwright/test';
import { linkFromEmail, uniqueEmail } from './mailpit';

const PASSWORD = 'correct horse battery staple';

async function register(page: Page, email: string) {
  await page.goto('/register');
  await page.getByLabel('Display name').fill('E2E Player');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();
}

async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
}

test('register → verify email → log in → log out', async ({ page }) => {
  const email = uniqueEmail('flow');
  await register(page, email);

  const verifyLink = await linkFromEmail(email, /verify your suresh email/i, 'verify-email');
  await page.goto(new URL(verifyLink).pathname + new URL(verifyLink).search);
  await expect(page.getByRole('heading', { name: 'Email verified' })).toBeVisible();
  // The token is stripped from the address bar after use.
  await expect(page).not.toHaveURL(/token=/);

  await login(page, email);
  await expect(page.getByText('Welcome back, E2E Player!')).toBeVisible();
  const accountMenu = page.getByRole('button', { name: /account menu for e2e player/i });
  await expect(accountMenu).toBeVisible();

  await accountMenu.click();
  await page.getByRole('menuitem', { name: 'Log out', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Log in' }).first()).toBeVisible();
});

test('unverified users see a verification banner', async ({ page }) => {
  const email = uniqueEmail('unverified');
  await register(page, email);
  await login(page, email);
  await expect(page.getByText(/please verify/i)).toBeVisible();
});

test('wrong password shows a generic error', async ({ page }) => {
  await login(page, uniqueEmail('nobody'), 'definitely wrong password');
  await expect(page.getByRole('alert')).toHaveText('Invalid email or password.');
});

test('forgot password → reset → log in with the new password', async ({ page }) => {
  const email = uniqueEmail('reset');
  await register(page, email);

  await page.goto('/forgot-password');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText(/if an account exists/i)).toBeVisible();

  const resetLink = await linkFromEmail(email, /reset your suresh password/i, 'reset-password');
  await page.goto(new URL(resetLink).pathname + new URL(resetLink).search);
  await page.getByLabel('New password', { exact: true }).fill('a brand new passphrase');
  await page.getByLabel('Confirm new password').fill('a brand new passphrase');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByRole('heading', { name: 'Password updated' })).toBeVisible();

  await login(page, email, PASSWORD);
  await expect(page.getByRole('alert')).toHaveText('Invalid email or password.');
  await login(page, email, 'a brand new passphrase');
  await expect(page.getByRole('button', { name: /account menu/i })).toBeVisible();
});
