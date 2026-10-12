// FR-060/061: AI risk analysis. Deliberately a SEPARATE module from
// aiOrchestrationService.js (not a shared one) and deliberately imports
// nothing from taskService.js or any Project/Task WRITE path — system-design.md
// §9's structural guarantee that this flow "never calls the Task or Project
// write services" is enforced by this file simply having no such import to
// misuse, not by convention. Project/Task are only ever read here.
import { AIArtifact } from '../models/AIArtifact.js';
import { Project } from '../models/Project.js';
import { Task } from '../models/Task.js';
import { callClaude, AIProviderError } from './aiProvider.js';
import { parseAndValidateRiskAssessment } from './riskSchema.js';
import { logAiFailure } from '../utils/aiLogging.js';

export class RiskGenerationFailedError extends Error {}
export class ArtifactNotFoundError extends Error {}

function toArtifactDto(artifact) {
  return {
    id: artifact._id.toString(),
    projectId: artifact.projectId.toString(),
    type: artifact.type,
    state: artifact.state,
    requestedBy: artifact.requestedBy.toString(),
    requestedAt: artifact.createdAt,
    // Never rawOutput (system-design.md §11) — only the validated form, and
    // only when the state isn't invalid.
    validatedOutput: artifact.state === 'invalid' ? null : artifact.validatedOutput,
  };
}

function buildRiskPrompt(project, existingTasks) {
  // FR-121: minimized context only — this project's own title/description and
  // existing task titles/statuses/due dates. No User/Membership/credential
  // data is reachable from here at all.
  const taskSummaries = existingTasks.map((t) => ({
    title: t.title,
    status: t.status,
    dueDate: t.dueDate,
  }));
  return [
    'You are a project risk analyst. Given a project and its current tasks, identify risks to the',
    'project succeeding and produce a JSON object of EXACTLY this shape:',
    '{"summary": string, "risks": [{"description": string, "severity": "low"|"medium"|"high"}]}.',
    'Respond with ONLY the JSON object, no other text, no markdown code fences.',
    '',
    `Project: ${project.name}`,
    `Description: ${project.description || '(none)'}`,
    `Existing tasks: ${JSON.stringify(taskSummaries)}`,
  ].join('\n');
}

// FR-060/061: request a risk assessment. Implements system-design.md §9's
// two-category failure taxonomy (shared with plan/summary):
//   Category A (provider/network/timeout) — no AIArtifact row at all.
//   Category B (schema-invalid output)    — AIArtifact row with state
//                                            'invalid' and rawOutput populated.
// No approval step at all (FR-061) — a schema-valid result moves directly to
// 'generated' and is immediately visible; it never creates, modifies, or
// deletes task/project data (FR-081).
export async function requestRiskAssessment(workspaceId, projectId, requestedBy) {
  const project = await Project.findOne({ _id: projectId, workspaceId });
  if (!project) {
    throw new ArtifactNotFoundError();
  }
  const existingTasks = await Task.find({ workspaceId, projectId });

  const inputContextRef = {
    projectName: project.name,
    projectDescription: project.description ?? null,
    existingTasks: existingTasks.map((t) => ({ title: t.title, status: t.status, dueDate: t.dueDate })),
  };

  let rawOutput;
  try {
    rawOutput = await callClaude(buildRiskPrompt(project, existingTasks));
  } catch (err) {
    if (err instanceof AIProviderError) {
      // Category A: nothing to store — there was no model response at all.
      logAiFailure({ category: 'provider_error', requestedBy });
      throw new RiskGenerationFailedError();
    }
    throw err;
  }

  const { valid, data } = parseAndValidateRiskAssessment(rawOutput);

  if (!valid) {
    // Category B: a response WAS obtained, but it failed schema validation —
    // retained for restricted diagnostics (FR-125/US-066), unlike Category A.
    const invalidArtifact = await AIArtifact.create({
      workspaceId,
      projectId,
      type: 'risk',
      requestedBy,
      inputContextRef,
      rawOutput,
      state: 'invalid',
    });
    logAiFailure({ category: 'schema_invalid', artifactId: invalidArtifact._id, requestedBy });
    throw new RiskGenerationFailedError();
  }

  const artifact = await AIArtifact.create({
    workspaceId,
    projectId,
    type: 'risk',
    requestedBy,
    inputContextRef,
    rawOutput,
    validatedOutput: data,
    state: 'generated',
  });

  return toArtifactDto(artifact);
}

export async function listRiskAssessments(workspaceId, projectId) {
  const artifacts = await AIArtifact.find({ workspaceId, projectId, type: 'risk' });
  return artifacts.map(toArtifactDto);
}

export async function getRiskAssessment(workspaceId, projectId, artifactId) {
  const artifact = await AIArtifact.findOne({ _id: artifactId, workspaceId, projectId, type: 'risk' });
  if (!artifact) {
    throw new ArtifactNotFoundError();
  }
  return toArtifactDto(artifact);
}
