import { test, expect } from '@playwright/test';
import { setNextAiResponse, signupAndLogin, uniqueEmail } from '../helpers.js';

async function createWorkspaceAndProject(page, label) {
  const workspaceName = `${label}-WS ${Date.now()}`;
  await page.getByLabel('Workspace name').fill(workspaceName);
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('link', { name: new RegExp(workspaceName) }).click();

  const projectName = `${label}-Project ${Date.now()}`;
  await page.getByLabel('Project name').fill(projectName);
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('link', { name: new RegExp(projectName) }).click();
}

test('approving a plan suggestion creates its proposed tasks', async ({ page }) => {
  await signupAndLogin(page, uniqueEmail('e2e-plan-approve'), 'correct-horse-battery-staple');
  await createWorkspaceAndProject(page, 'Approve');

  await setNextAiResponse({ tasks: [{ title: 'AI-suggested task one' }, { title: 'AI-suggested task two' }] });
  await page.getByLabel('Goal description').fill('Ship the onboarding flow');
  await page.getByRole('button', { name: 'Request plan' }).click();
  await expect(page.getByText('pending_review')).toBeVisible();

  // Before approval: the suggested tasks are visible inside the plan
  // preview, but NOT yet on the real task list above it.
  await expect(page.getByText('AI-suggested task one')).toHaveCount(1);
  await expect(page.getByLabel(/Status for AI-suggested task one/)).toHaveCount(0);

  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('approved')).toBeVisible();

  // After approval: the tasks are now real, tagged tasks on the board.
  await expect(page.getByLabel(/Status for AI-suggested task one/)).toBeVisible();
  await expect(page.getByLabel(/Status for AI-suggested task two/)).toBeVisible();
});

test('rejecting a plan suggestion creates no tasks', async ({ page }) => {
  await signupAndLogin(page, uniqueEmail('e2e-plan-reject'), 'correct-horse-battery-staple');
  await createWorkspaceAndProject(page, 'Reject');

  await setNextAiResponse({ tasks: [{ title: 'Should never be created' }] });
  await page.getByLabel('Goal description').fill('A goal nobody wants');
  await page.getByRole('button', { name: 'Request plan' }).click();
  await expect(page.getByText('pending_review')).toBeVisible();

  await page.getByRole('button', { name: 'Reject' }).click();
  await expect(page.getByText('rejected')).toBeVisible();

  await expect(page.getByLabel(/Status for Should never be created/)).toHaveCount(0);
  await expect(page.getByText('No tasks yet.')).toBeVisible();
});
