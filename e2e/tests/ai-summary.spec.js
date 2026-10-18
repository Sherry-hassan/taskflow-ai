import { test, expect } from '@playwright/test';
import { createWorkspaceAndProject, setNextAiResponse, signupAndLogin, uniqueEmail } from '../helpers.js';

test('requesting a progress summary shows the result immediately, with no approval step', async ({
  page,
}) => {
  await signupAndLogin(page, uniqueEmail('e2e-summary'), 'correct-horse-battery-staple');
  await createWorkspaceAndProject(page, 'Summary');

  await setNextAiResponse({
    summary: 'Steady progress this week on the onboarding flow.',
    highlights: ['Signup form finished', 'Login form in review'],
  });
  await page.getByRole('button', { name: 'Request summary' }).click();

  await expect(page.getByText('Steady progress this week on the onboarding flow.')).toBeVisible();
  await expect(page.getByText('Signup form finished')).toBeVisible();
  await expect(page.getByText('Login form in review')).toBeVisible();

  await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reject' })).toHaveCount(0);
});
