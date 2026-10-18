import { expect } from '@playwright/test';

export function uniqueEmail(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

// Signup redirects to /login via a client-side (SPA) route change, not a
// full page navigation — without an explicit wait for that transition to
// settle, immediately re-filling "Email"/"Password" (the same label text
// SignupForm and LoginForm both use) can race the transition. Found the hard
// way: every spec file duplicated this signup+login flow inline without the
// wait, and every one of them flaked identically until this checkpoint was
// added.
export async function signupAndLogin(page, email, password) {
  await page.goto('/signup');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign up' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await login(page, email, password);
}

// For a second browser context logging in as an ALREADY-registered account
// (e.g. the same user from a different context/connection) — signing up
// again would 409.
export async function login(page, email, password) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('heading', { name: 'Your workspaces' })).toBeVisible();
}

export async function setNextAiResponse(data) {
  await fetch(`${process.env.E2E_ANTHROPIC_FIXTURE_URL}/__set-next-response`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: JSON.stringify(data) }),
  });
}

// Polls the local SMTP catcher's control API (see fixtures/smtpCatcher.js)
// for the most recent email actually sent to `email`, and extracts a link
// from its body matching `linkRegex` — the same information a real recipient
// would see in their inbox. There is no shortcut around this: for both the
// invitation token and the password-reset token, only a one-way hash is ever
// persisted server-side — the raw value exists nowhere else but the sent
// email. `linkRegex`'s first capture group is returned as `token`.
export async function waitForEmailLink(email, linkRegex, { timeoutMs = 10000, intervalMs = 200 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${process.env.E2E_SMTP_CONTROL_URL}/messages/${encodeURIComponent(email)}`);
    if (res.status === 200) {
      const { message } = await res.json();
      const body = message.text || message.html || '';
      const match = body.match(linkRegex);
      if (match) {
        return { token: match[1], link: match[0] };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`No email matching the expected link was captured for ${email} within ${timeoutMs}ms`);
}

export function waitForInvitationLink(email, options) {
  return waitForEmailLink(email, /\/invitations\/([^/\s"'<]+)\/accept/, options);
}

export function waitForPasswordResetLink(email, options) {
  return waitForEmailLink(email, /\/reset-password\?token=([^\s"'<]+)/, options);
}

// Shared by every spec that needs a workspace + project to work inside —
// originally inline in ai-plan.spec.js, promoted here once a third spec
// needed the identical setup.
export async function createWorkspaceAndProject(page, label) {
  const workspaceName = `${label}-WS ${Date.now()}`;
  await page.getByLabel('Workspace name').fill(workspaceName);
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('link', { name: new RegExp(workspaceName) }).click();

  const projectName = `${label}-Project ${Date.now()}`;
  await page.getByLabel('Project name').fill(projectName);
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('link', { name: new RegExp(projectName) }).click();
}

export function apiBaseUrl() {
  return `http://localhost:${process.env.E2E_API_PORT}/api/v1`;
}
