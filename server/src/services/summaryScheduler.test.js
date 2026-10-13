import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { startTestDb, stopTestDb, clearTestDb } from '../test/testDb.js';
import {
  startSummaryScheduler,
  stopSummaryScheduler,
  SCHEDULED_SUMMARY_JOB_NAME,
} from './summaryScheduler.js';

// This test actually starts Agenda against a real (test) MongoDB and inspects
// the persisted job document — a pure `node --check` syntax check would not
// catch a wrong constructor-option shape or a wrong export name, both of
// which only surface at runtime. FR-104's weekly cadence is asserted against
// what Agenda actually persisted, not just what the source code says it
// intends to pass.
beforeAll(async () => {
  await startTestDb();
}, 60000);

afterEach(async () => {
  await stopSummaryScheduler();
  await clearTestDb();
});

afterAll(async () => {
  await stopTestDb();
});

describe('summaryScheduler (FR-071/104 — Agenda startup/shutdown)', () => {
  it('starts without throwing and persists a weekly recurring job for the summary job name', async () => {
    await startSummaryScheduler();

    const jobDoc = await mongoose.connection.db
      .collection('agendaJobs')
      .findOne({ name: SCHEDULED_SUMMARY_JOB_NAME });

    expect(jobDoc).toBeTruthy();
    expect(jobDoc.type).toBe('single'); // .every() always registers a 'single' (dedup'd) job
    expect(jobDoc.repeatInterval).toBe('0 0 * * 1');
    expect(jobDoc.repeatTimezone).toBe('UTC');
    expect(jobDoc.nextRunAt).toBeTruthy();
  });

  it('stops cleanly and can be restarted', async () => {
    await startSummaryScheduler();
    await stopSummaryScheduler();
    // A second start after a stop must not throw (real shutdown/restart path,
    // not just "construct and never touch again").
    await startSummaryScheduler();
  });
});
