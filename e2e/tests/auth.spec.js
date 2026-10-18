import { test, expect } from '@playwright/test';
import { signupAndLogin, uniqueEmail } from '../helpers.js';

test('signup, login, protected routes, and logout', async ({ page }) => {
  const email = uniqueEmail('e2e-auth');
  const password = 'correct-horse-battery-staple';

  // Visiting a protected route while unauthenticated redirects to /login.
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();

  await signupAndLogin(page, email, password);

  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();

  // After logout, the protected route is no longer reachable.
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
});

test('a reload preserves the session via silent refresh (no localStorage token)', async ({ page }) => {
  const email = uniqueEmail('e2e-reload');
  const password = 'correct-horse-battery-staple';

  await signupAndLogin(page, email, password);

  const localStorageIsEmpty = await page.evaluate(() => Object.keys(window.localStorage).length === 0);
  expect(localStorageIsEmpty).toBe(true);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your workspaces' })).toBeVisible();
});
