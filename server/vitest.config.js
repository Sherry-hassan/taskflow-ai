import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./src/test/vitestSetup.js'],
    hookTimeout: 60000,
    testTimeout: 30000,
    // Each integration test file spins up its own full mongodb-memory-server
    // replica set (a real mongod process). Running several of those files'
    // worker processes in parallel exhausted resources and crashed a worker
    // outright (observed directly: an access-violation-style exit code, not a
    // normal test failure) — this trades test-suite speed for correctness by
    // running files one at a time, so only one replica-set mongod ever starts
    // concurrently.
    fileParallelism: false,
  },
});
