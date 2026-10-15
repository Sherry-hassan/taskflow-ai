import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { startAnthropicFixture } from './fixtures/anthropicFixture.js';
import { startSmtpCatcher } from './fixtures/smtpCatcher.js';
import { API_PORT } from './e2eConfig.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(__dirname, '../server');

async function waitForHealth(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        return;
      }
    } catch {
      // Server not listening yet — keep polling.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Server did not become healthy at ${url} within ${timeoutMs}ms`);
}

// Real, approved behavior only — no test backdoor: a fresh, isolated
// mongodb-memory-server replica set (same tooling the Vitest suite already
// uses), the real Express server process (built from the real source, not a
// stub), a local Anthropic-shaped fixture (aiProvider.js's ANTHROPIC_BASE_URL
// seam), and a local SMTP catcher (Phase 2's real emailProvider.js, pointed
// at a local server instead of a real provider). No real paid API call, no
// real email, no real recipient, ever.
export default async function globalSetup() {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const mongoUri = replSet.getUri();

  const anthropicFixture = await startAnthropicFixture();
  const smtpCatcher = await startSmtpCatcher();

  const serverProcess = spawn(
    process.execPath,
    ['src/index.js'],
    {
      cwd: serverDir,
      env: {
        ...process.env,
        MONGODB_URI: mongoUri,
        PORT: String(API_PORT),
        JWT_SECRET: 'e2e-test-only-secret-not-a-real-credential',
        ANTHROPIC_API_KEY: 'e2e-fixture-key-not-a-real-credential',
        ANTHROPIC_BASE_URL: anthropicFixture.baseUrl,
        OPERATOR_DIAGNOSTIC_TOKEN: 'e2e-test-only-operator-token',
        RATE_LIMIT_DISABLED: 'true',
        SMTP_HOST: '127.0.0.1',
        SMTP_PORT: String(smtpCatcher.smtpPort),
        SMTP_USER: 'e2e',
        SMTP_PASS: 'e2e',
        EMAIL_FROM: 'taskflow-e2e@example.com',
        APP_BASE_URL: 'http://localhost:5173',
      },
      stdio: 'pipe',
    },
  );

  let serverLog = '';
  serverProcess.stdout.on('data', (chunk) => {
    serverLog += chunk;
  });
  serverProcess.stderr.on('data', (chunk) => {
    serverLog += chunk;
  });

  try {
    await waitForHealth(`http://localhost:${API_PORT}/health`);
  } catch (err) {
    throw new Error(`${err.message}\n--- server output ---\n${serverLog}`);
  }

  process.env.E2E_API_PORT = String(API_PORT);
  process.env.E2E_ANTHROPIC_FIXTURE_URL = anthropicFixture.baseUrl;
  process.env.E2E_SMTP_CONTROL_URL = smtpCatcher.controlUrl;

  return async function globalTeardown() {
    serverProcess.kill();
    anthropicFixture.server.close();
    await new Promise((resolve) => smtpCatcher.smtpServer.close(resolve));
    await new Promise((resolve) => smtpCatcher.controlServer.close(resolve));
    await replSet.stop();
  };
}
