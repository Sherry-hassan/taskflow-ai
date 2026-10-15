import { test, expect } from '@playwright/test';
import { login, signupAndLogin, uniqueEmail } from '../helpers.js';

test('a task created in one authenticated session appears live in another, same project', async ({
  browser,
}) => {
  const email = uniqueEmail('e2e-realtime');
  const password = 'correct-horse-battery-staple';

  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  await signupAndLogin(pageA, email, password);

  const workspaceName = `RT-WS ${Date.now()}`;
  await pageA.getByLabel('Workspace name').fill(workspaceName);
  await pageA.getByRole('button', { name: 'Create' }).click();
  await pageA.getByRole('link', { name: new RegExp(workspaceName) }).click();

  const projectName = `RT-Project ${Date.now()}`;
  await pageA.getByLabel('Project name').fill(projectName);
  await pageA.getByRole('button', { name: 'Create' }).click();
  await pageA.getByRole('link', { name: new RegExp(projectName) }).click();

  const projectUrl = pageA.url();

  // A genuinely separate browser context (separate cookies, storage, and
  // socket connection) — logged in as the SAME account, which is simplest
  // and sufficient for what this journey actually tests: realtime fan-out
  // across two independent connections, not workspace membership rules
  // (that's authorization.spec.js's job).
  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await login(pageB, email, password);
  await pageB.goto(projectUrl);
  await expect(pageB.getByRole('heading', { name: projectName })).toBeVisible();

  const taskTitle = `Realtime task ${Date.now()}`;
  await pageA.getByLabel('Task title').fill(taskTitle);
  await pageA.getByRole('button', { name: 'Add task' }).click();
  await expect(pageA.getByText(taskTitle)).toBeVisible();

  // The point of this test: pageB never submitted anything, yet sees the
  // task appear without a manual reload.
  await expect(pageB.getByText(taskTitle)).toBeVisible();

  await contextA.close();
  await contextB.close();
});
