import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { API_PORT, CLIENT_PORT } from './e2eConfig.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: './tests',
  // Each test signs up its own unique users/workspaces (see helpers.js's
  // uniqueEmail) against the one shared, isolated mongodb-memory-server
  // replica set started in globalSetup — tests never share mutable fixture
  // data with each other, so full parallelism is safe.
  fullyParallel: true,
  globalSetup: './global-setup.js',
  timeout: 30000,
  use: {
    baseURL: `http://localhost:${CLIENT_PORT}`,
    trace: 'retain-on-failure',
  },
  // Only the client dev server is managed as a Playwright webServer — the
  // API server, database, and AI/email fixtures are started in globalSetup,
  // since they must be ready (with their dynamic connection info) BEFORE the
  // API server process itself can start, which webServer's own lifecycle
  // doesn't support.
  webServer: {
    command: 'npm run dev -- --port ' + CLIENT_PORT + ' --strictPort',
    cwd: path.resolve(__dirname, '../client'),
    url: `http://localhost:${CLIENT_PORT}`,
    reuseExistingServer: false,
    env: {
      VITE_API_PROXY_TARGET: `http://localhost:${API_PORT}`,
    },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
