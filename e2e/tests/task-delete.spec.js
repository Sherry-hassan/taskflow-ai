import { test, expect } from '@playwright/test';
import { apiBaseUrl, login, signupAndLogin, uniqueEmail, waitForInvitationLink } from '../helpers.js';

test('deleting a task in one session removes it live in another, same project', async ({ browser }) => {
  const email = uniqueEmail('e2e-delete-rt');
  const password = 'correct-horse-battery-staple';

  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  await signupAndLogin(pageA, email, password);

  const workspaceName = `Del-WS ${Date.now()}`;
  await pageA.getByLabel('Workspace name').fill(workspaceName);
  await pageA.getByRole('button', { name: 'Create' }).click();
  await pageA.getByRole('link', { name: new RegExp(workspaceName) }).click();

  const projectName = `Del-Project ${Date.now()}`;
  await pageA.getByLabel('Project name').fill(projectName);
  await pageA.getByRole('button', { name: 'Create' }).click();
  await pageA.getByRole('link', { name: new RegExp(projectName) }).click();
  const projectUrl = pageA.url();

  const taskTitle = `Delete-RT task ${Date.now()}`;
  await pageA.getByLabel('Task title').fill(taskTitle);
  await pageA.getByRole('button', { name: 'Add task' }).click();
  await expect(pageA.getByText(taskTitle)).toBeVisible();

  // Same account, independent browser context/connection — same pattern as
  // realtime.spec.js: this test is about fan-out across connections, not
  // workspace membership rules (that's the unauthorized-delete test below).
  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await login(pageB, email, password);
  await pageB.goto(projectUrl);
  await expect(pageB.getByText(taskTitle)).toBeVisible();

  const taskCard = pageA.locator('div', { has: pageA.getByText(taskTitle) }).last();
  await taskCard.getByLabel(new RegExp(`Delete ${taskTitle}`)).click();
  await pageA.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(pageA.getByText(taskTitle)).toHaveCount(0);

  // pageB never deleted anything itself, yet sees the task disappear without
  // a manual reload — proves the task:deleted event, not just the local
  // state update on the deleting client.
  await expect(pageB.getByText(taskTitle)).toHaveCount(0);

  await contextA.close();
  await contextB.close();
});

test('a Member without task authority sees no delete control, and a direct API probe is independently rejected', async ({
  browser,
  request,
}) => {
  const password = 'correct-horse-battery-staple';
  const ownerEmail = uniqueEmail('e2e-delete-authz-owner');
  const memberEmail = uniqueEmail('e2e-delete-authz-member');

  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  await signupAndLogin(ownerPage, ownerEmail, password);

  const workspaceName = `Del-Authz-WS ${Date.now()}`;
  await ownerPage.getByLabel('Workspace name').fill(workspaceName);
  await ownerPage.getByRole('button', { name: 'Create' }).click();
  await ownerPage.getByRole('link', { name: new RegExp(workspaceName) }).click();

  await ownerPage.getByLabel('Email').fill(memberEmail);
  await ownerPage.getByLabel('Role').selectOption('member');
  await ownerPage.getByRole('button', { name: 'Invite' }).click();
  const { link } = await waitForInvitationLink(memberEmail);

  const projectName = `Del-Authz-Project ${Date.now()}`;
  await ownerPage.getByLabel('Project name').fill(projectName);
  await ownerPage.getByRole('button', { name: 'Create' }).click();
  await ownerPage.getByRole('link', { name: new RegExp(projectName) }).click();
  const projectUrl = ownerPage.url();

  const taskTitle = `Del-Authz task ${Date.now()}`;
  await ownerPage.getByLabel('Task title').fill(taskTitle);
  await ownerPage.getByRole('button', { name: 'Add task' }).click();
  await expect(ownerPage.getByText(taskTitle)).toBeVisible();

  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  await signupAndLogin(memberPage, memberEmail, password);
  await memberPage.goto(link);
  await expect(memberPage.getByRole('status')).toBeVisible();

  await memberPage.goto(projectUrl);
  await expect(memberPage.getByText(taskTitle)).toBeVisible();
  // Unassigned, not the creator, and only a Member — no delete authority
  // under FR-031/034, so no control should render at all.
  await expect(memberPage.getByLabel(new RegExp(`Delete ${taskTitle}`))).toHaveCount(0);

  // Direct API probe, bypassing the UI entirely — proves the server itself
  // rejects this, not just that the button happens to be hidden.
  const memberLoginRes = await request.post(`${apiBaseUrl()}/auth/login`, {
    data: { email: memberEmail, password },
  });
  const { accessToken } = await memberLoginRes.json();

  const workspaceId = projectUrl.match(/workspaces\/([^/]+)/)[1];
  const projectId = projectUrl.match(/projects\/([^/]+)/)[1];
  const tasksRes = await request.get(
    `${apiBaseUrl()}/workspaces/${workspaceId}/projects/${projectId}/tasks`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const tasks = await tasksRes.json();
  const target = tasks.find((t) => t.title === taskTitle);

  const deleteRes = await request.delete(
    `${apiBaseUrl()}/workspaces/${workspaceId}/projects/${projectId}/tasks/${target.id}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  expect(deleteRes.status()).toBe(403);

  await ownerContext.close();
  await memberContext.close();
});

test('a non-404 deletion failure shows a clear error and leaves the task visible', async ({ page }) => {
  const email = uniqueEmail('e2e-delete-fail');
  const password = 'correct-horse-battery-staple';
  await signupAndLogin(page, email, password);

  const workspaceName = `Del-Fail-WS ${Date.now()}`;
  await page.getByLabel('Workspace name').fill(workspaceName);
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('link', { name: new RegExp(workspaceName) }).click();

  const projectName = `Del-Fail-Project ${Date.now()}`;
  await page.getByLabel('Project name').fill(projectName);
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('link', { name: new RegExp(projectName) }).click();

  const taskTitle = `Del-Fail task ${Date.now()}`;
  await page.getByLabel('Task title').fill(taskTitle);
  await page.getByRole('button', { name: 'Add task' }).click();
  await expect(page.getByText(taskTitle)).toBeVisible();

  // Intercepts only the DELETE call for this task, mirroring the real
  // generic-error response shape (server/src/app.js's catch-all handler:
  // 500 { message: 'Internal server error' }) — every other request
  // (including the task list load) passes through untouched.
  await page.route('**/tasks/*', async (route) => {
    if (route.request().method() === 'DELETE') {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Internal server error' }),
      });
      return;
    }
    await route.continue();
  });

  const taskCard = page.locator('div', { has: page.getByText(taskTitle) }).last();
  await taskCard.getByLabel(new RegExp(`Delete ${taskTitle}`)).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();

  // ProjectPage.jsx's error banner, not the dialog itself — the dialog
  // closes on any outcome; the failure is surfaced on the page. The banner
  // shows the server's actual message (err.message), not a hardcoded
  // fallback string — same pattern as the existing status-change handler.
  await expect(page.getByRole('alert')).toContainText('Internal server error');
  await expect(page.getByText(taskTitle)).toBeVisible();
});

test('deleting a task while another client is disconnected removes it cleanly on reconnect, with no stale entry', async ({
  browser,
}) => {
  const email = uniqueEmail('e2e-delete-reconnect');
  const password = 'correct-horse-battery-staple';

  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  await signupAndLogin(pageA, email, password);

  const workspaceName = `Del-Reconnect-WS ${Date.now()}`;
  await pageA.getByLabel('Workspace name').fill(workspaceName);
  await pageA.getByRole('button', { name: 'Create' }).click();
  await pageA.getByRole('link', { name: new RegExp(workspaceName) }).click();

  const projectName = `Del-Reconnect-Project ${Date.now()}`;
  await pageA.getByLabel('Project name').fill(projectName);
  await pageA.getByRole('button', { name: 'Create' }).click();
  await pageA.getByRole('link', { name: new RegExp(projectName) }).click();
  const projectUrl = pageA.url();

  const taskTitle = `Del-Reconnect task ${Date.now()}`;
  await pageA.getByLabel('Task title').fill(taskTitle);
  await pageA.getByRole('button', { name: 'Add task' }).click();
  await expect(pageA.getByText(taskTitle)).toBeVisible();

  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await login(pageB, email, password);
  await pageB.goto(projectUrl);
  await expect(pageB.getByText(taskTitle)).toBeVisible();

  // Same disconnect/reconnect mechanism as realtime-reconnect.spec.js — A
  // drops off the network entirely and so cannot receive task:deleted at
  // all while offline.
  await contextA.setOffline(true);

  const taskCard = pageB.locator('div', { has: pageB.getByText(taskTitle) }).last();
  await taskCard.getByLabel(new RegExp(`Delete ${taskTitle}`)).click();
  await pageB.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(pageB.getByText(taskTitle)).toHaveCount(0);

  // A was offline for the entire deletion — confirm it genuinely still
  // shows the (now-deleted-elsewhere) task before reconnecting, so the
  // disappearance below can only be explained by the reconnect-triggered
  // re-fetch, not a race that happened to already clear it.
  await expect(pageA.getByText(taskTitle)).toBeVisible();

  await contextA.setOffline(false);

  // No manual reload — the reconnect-triggered re-fetch must remove it, and
  // exactly once (no stale duplicate left behind from the pre-offline render).
  await expect(pageA.getByText(taskTitle)).toHaveCount(0, { timeout: 15000 });

  await contextA.close();
  await contextB.close();
});
