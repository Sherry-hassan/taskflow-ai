import { test, expect } from '@playwright/test';
import { createWorkspaceAndProject, setNextAiResponse, signupAndLogin, uniqueEmail } from '../helpers.js';

test('requesting a risk assessment shows the result immediately, with no approval step', async ({
  page,
}) => {
  await signupAndLogin(page, uniqueEmail('e2e-risk'), 'correct-horse-battery-staple');
  await createWorkspaceAndProject(page, 'Risk');

  await setNextAiResponse({
    summary: 'The project has a tight deadline and one unassigned critical task.',
    risks: [{ description: 'Launch task has no assignee', severity: 'high' }],
  });
  await page.getByRole('button', { name: 'Request risk assessment' }).click();

  await expect(page.getByText('The project has a tight deadline and one unassigned critical task.')).toBeVisible();
  await expect(page.getByText('Launch task has no assignee')).toBeVisible();
  await expect(page.getByText('high')).toBeVisible();

  // Generated-only lifecycle: unlike a plan suggestion, there is no
  // approve/reject step for a risk assessment to wait on.
  await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reject' })).toHaveCount(0);
});
