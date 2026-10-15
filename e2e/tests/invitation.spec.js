import { test, expect } from '@playwright/test';
import { signupAndLogin, uniqueEmail, waitForInvitationLink } from '../helpers.js';

test('Owner invites a Member by email; the invited user accepts via the real captured link', async ({
  browser,
}) => {
  const password = 'correct-horse-battery-staple';
  const ownerEmail = uniqueEmail('e2e-owner');
  const memberEmail = uniqueEmail('e2e-member');

  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  await signupAndLogin(ownerPage, ownerEmail, password);

  const workspaceName = `Invite-WS ${Date.now()}`;
  await ownerPage.getByLabel('Workspace name').fill(workspaceName);
  await ownerPage.getByRole('button', { name: 'Create' }).click();
  await ownerPage.getByRole('link', { name: new RegExp(workspaceName) }).click();

  await ownerPage.getByLabel('Email').fill(memberEmail);
  await ownerPage.getByLabel('Role').selectOption('member');
  await ownerPage.getByRole('button', { name: 'Invite' }).click();
  await expect(ownerPage.getByText(`Invitation sent to ${memberEmail}.`)).toBeVisible();

  // The real email, captured by the local SMTP catcher — not a backdoor API,
  // the same information a real recipient's inbox would contain.
  const { link } = await waitForInvitationLink(memberEmail);

  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  await signupAndLogin(memberPage, memberEmail, password);

  await memberPage.goto(link);
  await expect(memberPage.getByRole('status')).toHaveText('Joined workspace as member.');

  await memberPage.goto('/');
  await expect(memberPage.getByRole('link', { name: new RegExp(workspaceName) })).toBeVisible();
  await expect(memberPage.getByText('member', { exact: true })).toBeVisible();

  await ownerContext.close();
  await memberContext.close();
});
