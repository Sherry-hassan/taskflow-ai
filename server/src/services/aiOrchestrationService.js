import mongoose from 'mongoose';
import { AIArtifact } from '../models/AIArtifact.js';
import { Project } from '../models/Project.js';
import { Task } from '../models/Task.js';
import { Membership } from '../models/Membership.js';
import { callClaude, AIProviderError } from './aiProvider.js';
import { parseAndValidatePlanSuggestion } from './planSchema.js';
import { logAiFailure } from '../utils/aiLogging.js';
import { emitToProject } from '../realtime/emitter.js';
import * as taskService from './taskService.js';

export class PlanGenerationFailedError extends Error {}
export class InsufficientApprovalAuthorityError extends Error {}
export class PlanNotPendingError extends Error {}
export class RevalidationFailedError extends Error {}
export class ArtifactNotFoundError extends Error {}

function toArtifactDto(artifact) {
  return {
    id: artifact._id.toString(),
    projectId: artifact.projectId.toString(),
    type: artifact.type,
    state: artifact.state,
    requestedBy: artifact.requestedBy.toString(),
    requestedAt: artifact.createdAt,
    approvedBy: artifact.approvedBy ? artifact.approvedBy.toString() : null,
    approvedAt: artifact.approvedAt ?? null,
    rejectedBy: artifact.rejectedBy ? artifact.rejectedBy.toString() : null,
    rejectedAt: artifact.rejectedAt ?? null,
    // Never rawOutput (system-design.md §11) — only the validated form, and
    // only when the state isn't invalid.
    validatedOutput: artifact.state === 'invalid' ? null : artifact.validatedOutput,
  };
}

function buildPlanPrompt(project, existingTasks, goalDescription) {
  // FR-121: minimized context only — this project's own title/description and
  // existing task titles/statuses/due dates. No User/Membership/credential
  // data is reachable from here at all; this function only ever receives the
  // Project/Task documents already fetched by the caller.
  const taskSummaries = existingTasks.map((t) => ({
    title: t.title,
    status: t.status,
    dueDate: t.dueDate,
  }));
  return [
    'You are a project planning assistant. Given a project and a goal, break the goal',
    'into a JSON object of EXACTLY this shape: {"tasks": [{"title": string, "description"?: string}]}.',
    'Respond with ONLY the JSON object, no other text, no markdown code fences.',
    '',
    `Project: ${project.name}`,
    `Description: ${project.description || '(none)'}`,
    `Existing tasks: ${JSON.stringify(taskSummaries)}`,
    '',
    `Goal: ${goalDescription}`,
  ].join('\n');
}

// FR-050/051: request a plan suggestion. Implements system-design.md §9's
// two-category failure taxonomy (shared with risk/summary, M5/M6):
//   Category A (provider/network/timeout) — no AIArtifact row at all.
//   Category B (schema-invalid output)    — AIArtifact row with state
//                                            'invalid' and rawOutput populated.
export async function requestPlanSuggestion(workspaceId, projectId, requestedBy, goalDescription) {
  const project = await Project.findOne({ _id: projectId, workspaceId });
  if (!project) {
    throw new ArtifactNotFoundError();
  }
  const existingTasks = await Task.find({ workspaceId, projectId });

  const inputContextRef = {
    projectName: project.name,
    projectDescription: project.description ?? null,
    existingTasks: existingTasks.map((t) => ({ title: t.title, status: t.status, dueDate: t.dueDate })),
    goalDescription,
  };

  let rawOutput;
  try {
    rawOutput = await callClaude(buildPlanPrompt(project, existingTasks, goalDescription));
  } catch (err) {
    if (err instanceof AIProviderError) {
      // Category A: nothing to store — there was no model response at all.
      logAiFailure({ category: 'provider_error', requestedBy });
      throw new PlanGenerationFailedError();
    }
    throw err;
  }

  const { valid, data } = parseAndValidatePlanSuggestion(rawOutput);

  if (!valid) {
    // Category B: a response WAS obtained, but it failed schema validation —
    // there is real (if unusable) content worth retaining for restricted
    // diagnostics (FR-125/US-066), so a row IS created here, unlike Category A.
    const invalidArtifact = await AIArtifact.create({
      workspaceId,
      projectId,
      type: 'plan',
      requestedBy,
      inputContextRef,
      rawOutput,
      state: 'invalid',
    });
    logAiFailure({ category: 'schema_invalid', artifactId: invalidArtifact._id, requestedBy });
    throw new PlanGenerationFailedError();
  }

  const artifact = await AIArtifact.create({
    workspaceId,
    projectId,
    type: 'plan',
    requestedBy,
    inputContextRef,
    rawOutput,
    validatedOutput: data,
    state: 'pending_review',
  });

  return toArtifactDto(artifact);
}

export async function listPlanSuggestions(workspaceId, projectId) {
  const artifacts = await AIArtifact.find({ workspaceId, projectId, type: 'plan' });
  return artifacts.map(toArtifactDto);
}

export async function getPlanSuggestion(workspaceId, projectId, artifactId) {
  const artifact = await AIArtifact.findOne({ _id: artifactId, workspaceId, projectId, type: 'plan' });
  if (!artifact) {
    throw new ArtifactNotFoundError();
  }
  return toArtifactDto(artifact);
}

// FR-052/055/056: the full approval flow, inside one transaction —
//   1. Fresh in-transaction authorization re-check (not the route middleware's
//      earlier, pre-transaction read — "fresh" means fresh at commit time).
//   2. Atomic conditional transition pending_review → approved.
//   3. Revalidation against the project's CURRENT state.
//   4. All-or-nothing task creation via the same Task creation primitive used
//      for manual task creation (not a parallel code path).
export async function approvePlanSuggestion(workspaceId, projectId, artifactId, actingUserId) {
  const session = await mongoose.startSession();
  let approvedDto;
  let createdTaskDocs = [];

  try {
    await session.withTransaction(async () => {
      const membership = await Membership.findOne({ workspaceId, userId: actingUserId }).session(
        session,
      );
      if (!membership || !['owner', 'admin'].includes(membership.role)) {
        throw new InsufficientApprovalAuthorityError();
      }

      const now = new Date();
      const approved = await AIArtifact.findOneAndUpdate(
        { _id: artifactId, workspaceId, projectId, type: 'plan', state: 'pending_review' },
        { $set: { state: 'approved', approvedBy: actingUserId, approvedAt: now } },
        { session, new: true },
      );
      if (!approved) {
        throw new PlanNotPendingError();
      }

      const project = await Project.findOne({ _id: projectId, workspaceId }).session(session);
      if (!project || project.archived) {
        throw new RevalidationFailedError();
      }

      const proposedTasks = approved.validatedOutput.tasks;
      for (const t of proposedTasks) {
        if (t.assigneeId) {
          try {
            await taskService.assertValidAssignee(workspaceId, t.assigneeId, { session });
          } catch {
            throw new RevalidationFailedError();
          }
        }
      }

      createdTaskDocs = [];
      for (const t of proposedTasks) {
        const doc = await taskService.insertTaskDocument(
          {
            workspaceId,
            projectId,
            title: t.title,
            description: t.description,
            assigneeId: t.assigneeId ?? null,
            createdBy: actingUserId,
            aiOriginated: true,
            sourceArtifactId: artifactId,
          },
          { session },
        );
        createdTaskDocs.push(doc);
      }
      await taskService.touchProjectActivity(projectId, { session, at: now });

      approvedDto = toArtifactDto(approved);
    });
  } finally {
    await session.endSession();
  }

  // Realtime emit only after the transaction has actually committed — a
  // failed/rolled-back transaction must never produce a "phantom" update
  // (system-design.md §7).
  for (const doc of createdTaskDocs) {
    emitToProject(projectId, 'task:created', taskService.toDto(doc));
  }

  return approvedDto;
}

// FR-053/054: identical atomic conditional-transition pattern as approval —
// this is why a simultaneous approve/reject race resolves to exactly one
// winner (US-048/049): both compete for the same conditional update.
export async function rejectPlanSuggestion(workspaceId, projectId, artifactId, actingUserId) {
  const membership = await Membership.findOne({ workspaceId, userId: actingUserId });
  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    throw new InsufficientApprovalAuthorityError();
  }

  const now = new Date();
  const rejected = await AIArtifact.findOneAndUpdate(
    { _id: artifactId, workspaceId, projectId, type: 'plan', state: 'pending_review' },
    { $set: { state: 'rejected', rejectedBy: actingUserId, rejectedAt: now } },
    { new: true },
  );
  if (!rejected) {
    throw new PlanNotPendingError();
  }
  return toArtifactDto(rejected);
}
