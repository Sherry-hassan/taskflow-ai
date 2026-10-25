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
  // Scoped to this specific risk row, not the whole page: a loose
  // page.getByText('high') also matches the unrelated task-priority <select>'s
  // "High"/"Highest" <option> text (TaskForm.jsx) once that field exists on
  // the same page, which is exactly what broke this assertion.
  // The outer <li> (one per risk assessment) and the inner <li> (one per
  // individual risk, AiRiskPanel.jsx) both contain this text — `.last()`
  // picks the innermost match, which is the one actually paired with the
  // severity badge.
  const riskRow = page.locator('li', { hasText: 'Launch task has no assignee' }).last();
  await expect(riskRow).toBeVisible();
  await expect(riskRow.getByText('high', { exact: true })).toBeVisible();

  // Generated-only lifecycle: unlike a plan suggestion, there is no
  // approve/reject step for a risk assessment to wait on.
  await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reject' })).toHaveCount(0);
});
