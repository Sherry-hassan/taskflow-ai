import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';

vi.mock('./aiProvider.js', async () => {
  const actual = await vi.importActual('./aiProvider.js');
  return { ...actual, callClaude: vi.fn() };
});

import { callClaude, AIProviderError } from './aiProvider.js';
import { startTestDb, stopTestDb, clearTestDb } from '../test/testDb.js';
import { Project } from '../models/Project.js';
import { AIArtifact } from '../models/AIArtifact.js';
import { ScheduledSummaryRun } from '../models/ScheduledSummaryRun.js';
import {
  getEligibleProjects,
  getWeekKey,
  runScheduledSummaryForProject,
  processScheduledSummaryJob,
  MAX_SUMMARY_ATTEMPTS,
} from './summaryService.js';

beforeAll(async () => {
  await startTestDb();
}, 60000);

beforeEach(() => {
  callClaude.mockReset();
});

afterEach(async () => {
  await clearTestDb();
});

afterAll(async () => {
  await stopTestDb();
});

function makeProject(overrides = {}) {
  return Project.create({
    workspaceId: new mongoose.Types.ObjectId(),
    name: overrides.name ?? 'Project',
    createdBy: new mongoose.Types.ObjectId(),
    archived: overrides.archived ?? false,
    lastTaskActivityAt: overrides.lastTaskActivityAt === undefined ? new Date() : overrides.lastTaskActivityAt,
  });
}

describe('getEligibleProjects (FR-103 — "active" eligibility)', () => {
  it('returns only non-archived projects with task activity in the trailing 30 days', async () => {
    const now = new Date('2026-10-12T00:00:00Z');
    const active = await makeProject({ name: 'Active', lastTaskActivityAt: new Date('2026-10-05T00:00:00Z') });
    await makeProject({ name: 'Stale', lastTaskActivityAt: new Date('2026-08-01T00:00:00Z') });
    await makeProject({
      name: 'ArchivedButRecent',
      archived: true,
      lastTaskActivityAt: new Date('2026-10-10T00:00:00Z'),
    });
    await makeProject({ name: 'NeverTouched', lastTaskActivityAt: null });

    const eligible = await getEligibleProjects(now);

    expect(eligible).toHaveLength(1);
    expect(eligible[0]._id.toString()).toBe(active._id.toString());
  });
});

describe('getWeekKey (FR-104)', () => {
  it('produces a stable ISO-week key for a given date', () => {
    expect(getWeekKey(new Date('2026-10-12T00:00:00Z'))).toMatch(/^2026-W\d{2}$/);
  });
});

describe('runScheduledSummaryForProject — idempotency (FR-105)', () => {
  it('a second attempt for the same (projectId, weekKey) is treated as already handled, not a second artifact', async () => {
    const project = await makeProject({ name: 'Idempotent' });
    callClaude.mockResolvedValue(JSON.stringify({ summary: 'ok', highlights: [] }));
    const weekKey = '2026-W41';

    const first = await runScheduledSummaryForProject(project, weekKey);
    expect(first.artifact).toBeDefined();

    const second = await runScheduledSummaryForProject(project, weekKey);
    expect(second.skipped).toBe(true);

    const artifacts = await AIArtifact.find({ projectId: project._id, type: 'summary' });
    expect(artifacts).toHaveLength(1);
    expect(callClaude).toHaveBeenCalledTimes(1);
  });
});

describe('runScheduledSummaryForProject — bounded retry, failure isolation (FR-106)', () => {
  it('retries up to MAX_SUMMARY_ATTEMPTS (3) total attempts, then marks the run failed with no artifact', async () => {
    const project = await makeProject({ name: 'AlwaysFails' });
    callClaude.mockRejectedValue(new AIProviderError('ECONNREFUSED'));

    const result = await runScheduledSummaryForProject(project, '2026-W41');

    expect(result.failed).toBe(true);
    expect(result.category).toBe('provider_error');
    expect(callClaude).toHaveBeenCalledTimes(MAX_SUMMARY_ATTEMPTS);

    const run = await ScheduledSummaryRun.findOne({ projectId: project._id, weekKey: '2026-W41' });
    expect(run.attempts).toBe(MAX_SUMMARY_ATTEMPTS);
    expect(run.status).toBe('failed');
    expect(run.lastFailureCategory).toBe('provider_error');

    const artifacts = await AIArtifact.find({ projectId: project._id, type: 'summary' });
    expect(artifacts).toHaveLength(0);
  });

  it("one project's exhausted failure never blocks a sibling project's run", async () => {
    const now = new Date();
    const failing = await makeProject({ name: 'Failing', lastTaskActivityAt: now });
    const succeeding = await makeProject({ name: 'Succeeding', lastTaskActivityAt: now });

    callClaude.mockImplementation(async (prompt) => {
      if (prompt.includes('Project: Failing')) {
        throw new AIProviderError('ECONNREFUSED');
      }
      return JSON.stringify({ summary: 'all good', highlights: [] });
    });

    const weekKey = getWeekKey(now);
    const results = await processScheduledSummaryJob(now);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);

    const failingRun = await ScheduledSummaryRun.findOne({ projectId: failing._id, weekKey });
    expect(failingRun.status).toBe('failed');
    const failingArtifacts = await AIArtifact.find({ projectId: failing._id, type: 'summary' });
    expect(failingArtifacts).toHaveLength(0);

    const succeedingRun = await ScheduledSummaryRun.findOne({ projectId: succeeding._id, weekKey });
    expect(succeedingRun.status).toBe('succeeded');
    const succeedingArtifacts = await AIArtifact.find({ projectId: succeeding._id, type: 'summary' });
    expect(succeedingArtifacts).toHaveLength(1);
    expect(succeedingArtifacts[0].state).toBe('generated');
    expect(succeedingArtifacts[0].requestedBy).toBeNull();
    expect(succeedingArtifacts[0].scheduledWeekKey).toBe(weekKey);
  });
});
