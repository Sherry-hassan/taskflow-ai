import { Task, TASK_STATUSES } from '../models/Task.js';
import { Project } from '../models/Project.js';
import { Membership } from '../models/Membership.js';
import { emitToProject } from '../realtime/emitter.js';

export class TaskNotFoundError extends Error {}
export class InvalidAssigneeError extends Error {}
export class InvalidStatusError extends Error {}
export class InsufficientTaskAuthorityError extends Error {}
export class AssigneeOnlySelfUnassignError extends Error {}

export function toDto(task) {
  return {
    id: task._id.toString(),
    workspaceId: task.workspaceId.toString(),
    projectId: task.projectId.toString(),
    title: task.title,
    description: task.description ?? null,
    status: task.status,
    assigneeId: task.assigneeId ? task.assigneeId.toString() : null,
    dueDate: task.dueDate ?? null,
    aiOriginated: task.aiOriginated,
    sourceArtifactId: task.sourceArtifactId ? task.sourceArtifactId.toString() : null,
  };
}

export async function assertValidAssignee(workspaceId, assigneeId, { session } = {}) {
  if (assigneeId === null || assigneeId === undefined) {
    return;
  }
  // FR-033: assignee must be a member of the same workspace as the task's
  // project — validated here, before saving, never trusted from the client
  // beyond "this is the ID they want."
  const query = Membership.findOne({ workspaceId, userId: assigneeId });
  const membership = session ? await query.session(session) : await query;
  if (!membership) {
    throw new InvalidAssigneeError();
  }
}

export async function touchProjectActivity(projectId, { session, at = new Date() } = {}) {
  await Project.updateOne(
    { _id: projectId },
    { $set: { lastTaskActivityAt: at } },
    session ? { session } : {},
  );
}

// The raw insert, with no membership/status validation and no realtime emit —
// the primitive that both createTask (below) and M4's plan-approval flow
// (aiOrchestrationService.js) build on, so task creation is never a parallel
// code path (system-design.md §8). Session-aware so it can participate in
// plan approval's transaction.
export async function insertTaskDocument(fields, { session } = {}) {
  const [task] = await Task.create([fields], { session });
  return task;
}

// FR-030: any workspace member with access to a project (enforced by the
// route's requireWorkspaceRole() — any role, membership only).
export async function createTask(workspaceId, projectId, userId, { title, description, status, assigneeId, dueDate }) {
  await assertValidAssignee(workspaceId, assigneeId);
  if (status !== undefined && !TASK_STATUSES.includes(status)) {
    throw new InvalidStatusError();
  }

  const task = await insertTaskDocument({
    workspaceId,
    projectId,
    title,
    description,
    status,
    assigneeId: assigneeId ?? null,
    dueDate,
    createdBy: userId,
  });
  await touchProjectActivity(projectId);

  const dto = toDto(task);
  emitToProject(projectId, 'task:created', dto);
  return dto;
}

export async function listTasks(workspaceId, projectId) {
  const tasks = await Task.find({ workspaceId, projectId });
  return tasks.map(toDto);
}

function hasTaskAuthority(task, actingUserId, actingRole) {
  if (actingRole === 'owner' || actingRole === 'admin') return true;
  if (String(task.createdBy) === String(actingUserId)) return true;
  if (task.assigneeId && String(task.assigneeId) === String(actingUserId)) return true;
  return false;
}

// FR-031/033/034: general update authority is creator/assignee/Owner/Admin.
// Reassigning to a *different* person additionally requires creator/Owner/Admin
// — the current assignee's own authority covers self-unassignment only (US-039).
export async function updateTask(workspaceId, projectId, taskId, actingUserId, actingRole, updates) {
  const task = await Task.findOne({ _id: taskId, workspaceId, projectId });
  if (!task) {
    throw new TaskNotFoundError();
  }

  if (!hasTaskAuthority(task, actingUserId, actingRole)) {
    throw new InsufficientTaskAuthorityError();
  }

  const isCreatorOrAdmin =
    actingRole === 'owner' || actingRole === 'admin' || String(task.createdBy) === String(actingUserId);
  const isOnlyCurrentAssignee = !isCreatorOrAdmin && task.assigneeId && String(task.assigneeId) === String(actingUserId);

  if (Object.prototype.hasOwnProperty.call(updates, 'assigneeId')) {
    const newAssigneeId = updates.assigneeId;
    if (isOnlyCurrentAssignee && newAssigneeId !== null) {
      // The current assignee, with no other authority, may only unassign
      // themselves — not reassign to someone else.
      throw new AssigneeOnlySelfUnassignError();
    }
    await assertValidAssignee(workspaceId, newAssigneeId);
    task.assigneeId = newAssigneeId;
  }

  if (updates.title !== undefined) task.title = updates.title;
  if (updates.description !== undefined) task.description = updates.description;
  if (updates.dueDate !== undefined) task.dueDate = updates.dueDate;
  if (updates.status !== undefined) {
    if (!TASK_STATUSES.includes(updates.status)) {
      throw new InvalidStatusError();
    }
    task.status = updates.status;
  }

  await task.save();
  await touchProjectActivity(projectId);

  const dto = toDto(task);
  emitToProject(projectId, 'task:updated', dto);
  return dto;
}

// FR-031: same authority as general update — creator/assignee/Owner/Admin.
export async function deleteTask(workspaceId, projectId, taskId, actingUserId, actingRole) {
  const task = await Task.findOne({ _id: taskId, workspaceId, projectId });
  if (!task) {
    throw new TaskNotFoundError();
  }
  if (!hasTaskAuthority(task, actingUserId, actingRole)) {
    throw new InsufficientTaskAuthorityError();
  }

  await Task.deleteOne({ _id: task._id });
  emitToProject(projectId, 'task:deleted', { id: taskId });
}
