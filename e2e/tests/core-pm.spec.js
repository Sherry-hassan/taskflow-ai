import { test, expect } from '@playwright/test';
import { signupAndLogin, uniqueEmail } from '../helpers.js';

test('core PM journey: workspace, project, task, status change', async ({ page }) => {
  const email = uniqueEmail('e2e-core');
  const password = 'correct-horse-battery-staple';
  await signupAndLogin(page, email, password);

  const workspaceName = `Acme ${Date.now()}`;
  await page.getByLabel('Workspace name').fill(workspaceName);
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('link', { name: new RegExp(workspaceName) }).click();

  await expect(page.getByRole('heading', { name: workspaceName })).toBeVisible();

  const projectName = `Launch ${Date.now()}`;
  await page.getByLabel('Project name').fill(projectName);
  await page.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('link', { name: new RegExp(projectName) }).click();

  await expect(page.getByRole('heading', { name: projectName })).toBeVisible();

  const taskTitle = `Design the schema ${Date.now()}`;
  await page.getByLabel('Task title').fill(taskTitle);
  await page.getByRole('button', { name: 'Add task' }).click();

  await expect(page.getByText(taskTitle)).toBeVisible();

  // TaskCard's status select — scoped to the task's own card to avoid
  // ambiguity if more than one task is ever present.
  const taskCard = page.locator('div', { has: page.getByText(taskTitle) }).last();
  const statusSelect = taskCard.getByLabel(new RegExp(`Status for ${taskTitle}`));
  await statusSelect.selectOption('in_progress');
  await expect(statusSelect).toHaveValue('in_progress');

  // Delete: confirm the dialog gates the request (Cancel makes no change),
  // then actually deletes and confirms the card is gone from the board —
  // the authorized-deletion + real-time-removal path (FR-031).
  await taskCard.getByLabel(new RegExp(`Delete ${taskTitle}`)).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText(taskTitle)).toBeVisible();

  await taskCard.getByLabel(new RegExp(`Delete ${taskTitle}`)).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText(taskTitle)).toHaveCount(0);
});
