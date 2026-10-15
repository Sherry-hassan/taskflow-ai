import { test, expect } from '@playwright/test';
import {
  apiBaseUrl,
  setNextAiResponse,
  signupAndLogin,
  uniqueEmail,
  waitForInvitationLink,
} from '../helpers.js';

test('a Member sees no approve/reject controls, and a direct API probe is independently rejected (403)', async ({
  browser,
  request,
}) => {
  const password = 'correct-horse-battery-staple';
  const ownerEmail = uniqueEmail('e2e-authz-owner');
  const memberEmail = uniqueEmail('e2e-authz-member');

  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  await signupAndLogin(ownerPage, ownerEmail, password);

  const workspaceName = `Authz-WS ${Date.now()}`;
  await ownerPage.getByLabel('Workspace name').fill(workspaceName);
  await ownerPage.getByRole('button', { name: 'Create' }).click();
  await ownerPage.getByRole('link', { name: new RegExp(workspaceName) }).click();

  // Invite while still on the workspace page — the invite form lives there,
  // not on the project page.
  await ownerPage.getByLabel('Email').fill(memberEmail);
  await ownerPage.getByLabel('Role').selectOption('member');
  await ownerPage.getByRole('button', { name: 'Invite' }).click();
  const { link } = await waitForInvitationLink(memberEmail);

  const projectName = `Authz-Project ${Date.now()}`;
  await ownerPage.getByLabel('Project name').fill(projectName);
  await ownerPage.getByRole('button', { name: 'Create' }).click();
  await ownerPage.getByRole('link', { name: new RegExp(projectName) }).click();
  const projectUrl = ownerPage.url();

  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  await signupAndLogin(memberPage, memberEmail, password);
  await memberPage.goto(link);
  await expect(memberPage.getByRole('status')).toBeVisible();

  await setNextAiResponse({ tasks: [{ title: 'Authz-check task' }] });
  await ownerPage.goto(projectUrl);
  await ownerPage.getByLabel('Goal description').fill('A goal for the authorization check');
  await ownerPage.getByRole('button', { name: 'Request plan' }).click();
  await expect(ownerPage.getByText('pending_review')).toBeVisible();

  await memberPage.goto(projectUrl);
  await expect(memberPage.getByText('pending_review')).toBeVisible();
  await expect(memberPage.getByRole('button', { name: 'Approve' })).toHaveCount(0);
  await expect(memberPage.getByRole('button', { name: 'Reject' })).toHaveCount(0);

  // Direct API probe, bypassing the UI entirely — proves the server itself
  // rejects this, not just that the button happens to be hidden.
  const memberLoginRes = await request.post(`${apiBaseUrl()}/auth/login`, {
    data: { email: memberEmail, password },
  });
  const { accessToken } = await memberLoginRes.json();

  const workspaceId = projectUrl.match(/workspaces\/([^/]+)/)[1];
  const projectId = projectUrl.match(/projects\/([^/]+)/)[1];
  const plansRes = await request.get(
    `${apiBaseUrl()}/workspaces/${workspaceId}/projects/${projectId}/ai/plans`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const plans = await plansRes.json();
  const pending = plans.find((p) => p.state === 'pending_review');

  const approveRes = await request.post(
    `${apiBaseUrl()}/workspaces/${workspaceId}/projects/${projectId}/ai/plans/${pending.id}/approve`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  expect(approveRes.status()).toBe(403);

  await ownerContext.close();
  await memberContext.close();
});
