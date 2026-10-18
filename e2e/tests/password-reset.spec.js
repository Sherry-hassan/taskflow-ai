import { test, expect } from '@playwright/test';
import { apiBaseUrl, signupAndLogin, uniqueEmail, waitForPasswordResetLink } from '../helpers.js';

test('reset completes via the real emailed link; the old session stops working, the new password logs in', async ({
  page,
  request,
}) => {
  const email = uniqueEmail('e2e-reset');
  const oldPassword = 'correct-horse-battery-staple';
  const newPassword = 'a-brand-new-correct-horse-battery';

  await signupAndLogin(page, email, oldPassword);

  // Capture the pre-reset session's cookies directly from the browser
  // context's cookie jar (Playwright can read httpOnly cookies this way,
  // unlike document.cookie) — this is what "the old session" means below.
  const oldCookies = await page.context().cookies();
  const oldRefreshToken = oldCookies.find((c) => c.name === 'refreshToken').value;
  const oldCsrfToken = oldCookies.find((c) => c.name === 'csrfToken').value;

  await page.goto('/forgot-password');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('status')).toHaveText(
    'If that email is registered, a reset link has been sent.',
  );

  // The real email, captured by the local SMTP catcher — not a backdoor API;
  // the raw token exists nowhere else but the sent email (only its one-way
  // hash is persisted server-side).
  const { link } = await waitForPasswordResetLink(email);

  await page.goto(link);
  await page.getByLabel('New password').fill(newPassword);
  await page.getByRole('button', { name: 'Reset password' }).click();
  await expect(page.getByRole('status')).toHaveText('Your password has been reset. You can now log in.');

  // The old session's refresh token no longer works (FR-009: full session
  // revocation on completion) — probed directly against the API with the
  // pre-reset cookies, independent of whatever the UI currently shows.
  const refreshRes = await request.post(`${apiBaseUrl()}/auth/refresh`, {
    headers: {
      Cookie: `refreshToken=${oldRefreshToken}; csrfToken=${oldCsrfToken}`,
      'X-CSRF-Token': oldCsrfToken,
    },
  });
  expect(refreshRes.status()).toBe(401);

  // Logging in with the new password succeeds.
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(newPassword);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('heading', { name: 'Your workspaces' })).toBeVisible();
});
