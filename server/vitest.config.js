import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./src/test/vitestSetup.js'],
    hookTimeout: 60000,
    testTimeout: 30000,
  },
});
