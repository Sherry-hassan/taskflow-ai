// FR-070–073, FR-103–107: AI progress summaries, on-demand and scheduled.
// Deliberately a SEPARATE module from aiOrchestrationService.js (M4) and
// riskAssessmentService.js (M5) — like the risk flow, this file imports
// nothing from taskService.js/projectService.js or Mongoose transaction
// machinery, so system-design.md §9's "never calls the Task or Project write
// services" guarantee is structural here too, not merely conventional.
import { AIArtifact } from '../models/AIArtifact.js';
import { Project } from '../models/Project.js';
import { Task } from '../models/Task.js';
import { ScheduledSummaryRun } from '../models/ScheduledSummaryRun.js';
import { callClaude, AIProviderError } from './aiProvider.js';
import { parseAndValidateSummary } from './summarySchema.js';
import { logAiFailure } from '../utils/aiLogging.js';

export class SummaryGenerationFailedError extends Error {}
export class ArtifactNotFoundError extends Error {}

// FR-106 v0.4 (resolved): 3 total attempts (1 initial + 2 retries). A single
// named, reconfigurable constant per implementation-plan.md §8's scope.
export const MAX_SUMMARY_ATTEMPTS = 3;

// FR-103: non-archived, with task activity in the trailing 30 days.
const ACTIVE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function toArtifactDto(artifact) {
  return {
    id: artifact._id.toString(),
    projectId: artifact.projectId.toString(),
    type: artifact.type,
    state: artifact.state,
    requestedBy: artifact.requestedBy ? artifact.requestedBy.toString() : null,
    requestedAt: artifact.createdAt,
    // Never rawOutput (system-design.md §11) — only the validated form, and
    // only when the state isn't invalid.
    validatedOutput: artifact.state === 'invalid' ? null : artifact.validatedOutput,
  };
}

function buildSummaryPrompt(project, existingTasks) {
  // FR-121: minimized context only — this project's own title/description and
  // existing task titles/statuses/due dates. No User/Membership/credential
  // data is reachable from here at all.
  const taskSummaries = existingTasks.map((t) => ({
    title: t.title,
    status: t.status,
    dueDate: t.dueDate,
  }));
  return [
    'You are a project status reporter. Given a project and its current tasks, produce a concise',
    'progress summary as a JSON object of EXACTLY this shape:',
    '{"summary": string, "highlights": [string]}.',
    'Respond with ONLY the JSON object, no other text, no markdown code fences.',
    '',
    `Project: ${project.name}`,
    `Description: ${project.description || '(none)'}`,
    `Existing tasks: ${JSON.stringify(taskSummaries)}`,
  ].join('\n');
}

function buildInputContextRef(project, existingTasks) {
  return {
    projectName: project.name,
    projectDescription: project.description ?? null,
    existingTasks: existingTasks.map((t) => ({ title: t.title, status: t.status, dueDate: t.dueDate })),
  };
}

// FR-070: request an on-demand progress summary. Implements system-design.md
// §9's two-category failure taxonomy (shared with plan/risk):
//   Category A (provider/network/timeout) — no AIArtifact row at all.
//   Category B (schema-invalid output)    — AIArtifact row with state
//                                            'invalid' and rawOutput populated.
// No approval step at all (FR-072) — a schema-valid result moves directly to
// 'generated' and is immediately visible; it never creates, modifies, or
// deletes task/project data (FR-081).
export async function requestSummary(workspaceId, projectId, requestedBy) {
  const project = await Project.findOne({ _id: projectId, workspaceId });
  if (!project) {
    throw new ArtifactNotFoundError();
  }
  const existingTasks = await Task.find({ workspaceId, projectId });
  const inputContextRef = buildInputContextRef(project, existingTasks);

  let rawOutput;
  try {
    rawOutput = await callClaude(buildSummaryPrompt(project, existingTasks));
  } catch (err) {
    if (err instanceof AIProviderError) {
      // Category A: nothing to store — there was no model response at all.
      logAiFailure({ category: 'provider_error', requestedBy });
      throw new SummaryGenerationFailedError();
    }
    throw err;
  }

  const { valid, data } = parseAndValidateSummary(rawOutput);

  if (!valid) {
    // Category B: a response WAS obtained, but it failed schema validation —
    // retained for restricted diagnostics (FR-125/US-066), unlike Category A.
    const invalidArtifact = await AIArtifact.create({
      workspaceId,
      projectId,
      type: 'summary',
      requestedBy,
      inputContextRef,
      rawOutput,
      state: 'invalid',
    });
    logAiFailure({ category: 'schema_invalid', artifactId: invalidArtifact._id, requestedBy });
    throw new SummaryGenerationFailedError();
  }

  const artifact = await AIArtifact.create({
    workspaceId,
    projectId,
    type: 'summary',
    requestedBy,
    inputContextRef,
    rawOutput,
    validatedOutput: data,
    state: 'generated',
  });

  return toArtifactDto(artifact);
}

export async function listSummaries(workspaceId, projectId) {
  const artifacts = await AIArtifact.find({ workspaceId, projectId, type: 'summary' });
  return artifacts.map(toArtifactDto);
}

export async function getSummary(workspaceId, projectId, artifactId) {
  const artifact = await AIArtifact.findOne({ _id: artifactId, workspaceId, projectId, type: 'summary' });
  if (!artifact) {
    throw new ArtifactNotFoundError();
  }
  return toArtifactDto(artifact);
}

// FR-104: ISO-8601-style week key, e.g. "2026-W41" — one value per scheduled
// cadence occurrence, shared by ScheduledSummaryRun's idempotency key and
// AIArtifact.scheduledWeekKey.
export function getWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // ISO week: shift to the Thursday of this week so the week "belongs" to the
  // year containing that Thursday (standard ISO-8601 week-numbering rule).
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

// FR-103: "active" = not archived and has had task activity in the trailing
// 30 days. Reads Project.lastTaskActivityAt directly (denormalized exactly
// for this query, database-design.md §7) rather than scanning Task.
export async function getEligibleProjects(now = new Date()) {
  return Project.find({
    archived: false,
    lastTaskActivityAt: { $gte: new Date(now.getTime() - ACTIVE_WINDOW_MS) },
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The scheduled job's per-project processing function — the same function
// Agenda's scheduler calls (summaryScheduler.js), and the function
// test-strategy.md §5.5 says tests should invoke directly rather than
// exercising real wall-clock/Agenda scheduling.
//
// FR-105 (idempotency): the ScheduledSummaryRun insert below is the actual
// idempotency mechanism — its unique (projectId, weekKey) index means a
// second attempt for the same run hits a duplicate-key error and is treated
// as "already handled," not retried as a new run.
// FR-106 (bounded retry, failure isolation): up to MAX_SUMMARY_ATTEMPTS total
// attempts with backoff; this function never throws for an AI failure (it
// isolates the failure to this project's own ScheduledSummaryRun), so a
// caller processing many projects never has one project's failure affect
// another's.
export async function runScheduledSummaryForProject(project, weekKey) {
  let run;
  try {
    run = await ScheduledSummaryRun.create({ projectId: project._id, weekKey, status: 'in_progress', attempts: 0 });
  } catch (err) {
    if (err.code === 11000) {
      // Duplicate key: another attempt for this (projectId, weekKey) already
      // exists — already handled (or being handled), not a new run.
      return { skipped: true };
    }
    throw err;
  }

  const existingTasks = await Task.find({ workspaceId: project.workspaceId, projectId: project._id });
  const inputContextRef = buildInputContextRef(project, existingTasks);

  for (let attempt = 1; attempt <= MAX_SUMMARY_ATTEMPTS; attempt += 1) {
    run.attempts = attempt;
    await run.save();

    const outcome = await attemptSummaryGeneration(project, weekKey, inputContextRef, existingTasks);

    if (outcome.succeeded) {
      run.status = 'succeeded';
      run.resultArtifactId = outcome.artifact._id;
      await run.save();
      return { artifact: toArtifactDto(outcome.artifact) };
    }

    logAiFailure({ category: outcome.category, artifactId: outcome.artifactId ?? null });

    if (attempt < MAX_SUMMARY_ATTEMPTS) {
      await sleep(25 * attempt); // small backoff between attempts
      continue;
    }

    run.status = 'failed';
    run.lastFailureCategory = outcome.category;
    await run.save();
    return { failed: true, category: outcome.category };
  }

  // Unreachable — the loop above always returns on its final iteration.
  return { failed: true };
}

// A single generation attempt for the scheduled flow: calls Claude, validates
// the response, and on success persists the 'generated' AIArtifact. On
// failure (either taxonomy category) it persists only what Category B calls
// for (system-design.md §9) and reports back which category occurred, so the
// retry loop above can log/record it without duplicating that logic per call.
async function attemptSummaryGeneration(project, weekKey, inputContextRef, existingTasks) {
  let rawOutput;
  try {
    rawOutput = await callClaude(buildSummaryPrompt(project, existingTasks));
  } catch (err) {
    if (!(err instanceof AIProviderError)) {
      throw err;
    }
    // Category A: no model response was obtained at all — no AIArtifact row.
    return { succeeded: false, category: 'provider_error' };
  }

  const { valid, data } = parseAndValidateSummary(rawOutput);
  if (valid) {
    const artifact = await AIArtifact.create({
      workspaceId: project.workspaceId,
      projectId: project._id,
      type: 'summary',
      requestedBy: null,
      inputContextRef,
      rawOutput,
      validatedOutput: data,
      state: 'generated',
      scheduledWeekKey: weekKey,
    });
    return { succeeded: true, artifact };
  }

  // Category B: a response was obtained but failed validation — an
  // AIArtifact row IS created (retained for diagnostics), unlike Category A.
  const invalidArtifact = await AIArtifact.create({
    workspaceId: project.workspaceId,
    projectId: project._id,
    type: 'summary',
    requestedBy: null,
    inputContextRef,
    rawOutput,
    state: 'invalid',
    scheduledWeekKey: weekKey,
  });
  return { succeeded: false, category: 'schema_invalid', artifactId: invalidArtifact._id };
}

// Processes every eligible project for the current scheduled run (FR-071).
// One project's failure never blocks another's (FR-106) — each project's
// outcome is isolated via Promise.allSettled, never awaited sequentially in a
// way that would let one rejection short-circuit the rest.
export async function processScheduledSummaryJob(now = new Date()) {
  const weekKey = getWeekKey(now);
  const projects = await getEligibleProjects(now);
  return Promise.allSettled(projects.map((project) => runScheduledSummaryForProject(project, weekKey)));
}
