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
    // normal test failure). `fileParallelism: false` alone was NOT sufficient
    // — two files still crashed concurrently in practice — so this also pins
    // the pool to a single fork process, guaranteeing only one replica-set
    // mongod can ever exist at a time. Trades test-suite speed for correctness.
    fileParallelism: false,
    pool: 'forks',
    // `poolOptions.forks.singleFork` is deprecated in this Vitest version
    // ("poolOptions was removed in Vitest 4 — all previous poolOptions are now
    // top-level options") and was silently ignored. maxWorkers/minWorkers are
    // the current top-level equivalent — pinning both to 1 guarantees exactly
    // one worker process for the whole run, so only one mongodb-memory-server
    // replica set can ever exist at a time.
    maxWorkers: 1,
    minWorkers: 1,
  },
});
