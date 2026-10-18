import { test, expect } from '@playwright/test';
import { login, signupAndLogin, uniqueEmail } from '../helpers.js';

// system-design.md §7's documented v1 recovery behavior: a dropped
// connection means every event the server emitted in the meantime was
// missed entirely (there is no event replay) — on reconnect, the client is
// expected to re-fetch current state instead. This is distinct from
// realtime.spec.js, which proves the live socket path works while both
// clients stay continuously connected.
test('a client that reconnects after a dropped connection re-fetches and shows the task it missed', async ({
  browser,
}) => {
  const email = uniqueEmail('e2e-reconnect');
  const password = 'correct-horse-battery-staple';

  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  await signupAndLogin(pageA, email, password);

  const workspaceName = `Reconnect-WS ${Date.now()}`;
  await pageA.getByLabel('Workspace name').fill(workspaceName);
  await pageA.getByRole('button', { name: 'Create' }).click();
  await pageA.getByRole('link', { name: new RegExp(workspaceName) }).click();

  const projectName = `Reconnect-Project ${Date.now()}`;
  await pageA.getByLabel('Project name').fill(projectName);
  await pageA.getByRole('button', { name: 'Create' }).click();
  await pageA.getByRole('link', { name: new RegExp(projectName) }).click();
  const projectUrl = pageA.url();

  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await login(pageB, email, password);
  await pageB.goto(projectUrl);
  await expect(pageB.getByRole('heading', { name: projectName })).toBeVisible();

  // Simulate a dropped connection for A only — a full network outage for
  // its browser context, matching test-strategy.md §6's own suggested
  // mechanism ("simulate via Playwright's network conditions"). Socket.IO's
  // own reconnection logic takes it from here once the network returns.
  await contextA.setOffline(true);

  const taskTitle = `Missed-while-offline task ${Date.now()}`;
  await pageB.getByLabel('Task title').fill(taskTitle);
  await pageB.getByRole('button', { name: 'Add task' }).click();
  await expect(pageB.getByText(taskTitle)).toBeVisible();

  // A was offline for the entire create — it could not have received
  // task:created. Confirm it genuinely isn't there yet before reconnecting,
  // so the eventual appearance below can only be explained by the
  // reconnect-triggered re-fetch, not a race that happened to still work.
  await expect(pageA.getByText(taskTitle)).toHaveCount(0);

  await contextA.setOffline(false);

  // No manual reload, no re-navigation — the reconnect itself must trigger
  // the re-fetch that brings this into view.
  await expect(pageA.getByText(taskTitle)).toBeVisible({ timeout: 15000 });

  await contextA.close();
  await contextB.close();
});
