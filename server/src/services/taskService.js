import { Task, TASK_STATUSES, TASK_PRIORITIES } from '../models/Task.js';
import { Project } from '../models/Project.js';
import { Membership } from '../models/Membership.js';
import { emitToProject } from '../realtime/emitter.js';

export class TaskNotFoundError extends Error {}
export class InvalidAssigneeError extends Error {}
export class InvalidStatusError extends Error {}
export class InvalidPriorityError extends Error {}
export class InvalidDateRangeError extends Error {}
export class InvalidLabelsError extends Error {}
export class InsufficientTaskAuthorityError extends Error {}
export class AssigneeOnlySelfUnassignError extends Error {}

const MAX_LABELS = 10;
const MAX_LABEL_LENGTH = 30;

// Date-only convention (database-design.md §8 revision): client sends a
// calendar date (either "YYYY-MM-DD" from a native date input, or a full
// ISO string); this normalizes it to UTC midnight of that date so ordering
// and overdue comparisons never drift across the server's/clients' local
// timezones. `null` explicitly clears the field; `undefined` means "leave
// as-is" and is handled by the caller before this runs.
export function parseDateOnly(value) {
  if (value === null) return null;
  const datePart = typeof value === 'string' ? value.slice(0, 10) : value;
  const parsed = new Date(`${datePart}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new InvalidDateRangeError();
  }
  return parsed;
}

export function assertValidDateRange(startDate, dueDate) {
  if (startDate && dueDate && startDate.getTime() > dueDate.getTime()) {
    throw new InvalidDateRangeError();
  }
}

// Labels are free-text tags (no separate Label collection) — trimmed,
// deduplicated, and capped so a client can't store unbounded strings here.
export function sanitizeLabels(labels) {
  if (labels === null || labels === undefined) return [];
  if (!Array.isArray(labels)) {
    throw new InvalidLabelsError();
  }
  const cleaned = [];
  for (const raw of labels) {
    if (typeof raw !== 'string') {
      throw new InvalidLabelsError();
    }
    const trimmed = raw.trim();
    if (!trimmed || trimmed.length > MAX_LABEL_LENGTH) {
      throw new InvalidLabelsError();
    }
    if (!cleaned.includes(trimmed)) {
      cleaned.push(trimmed);
    }
  }
  if (cleaned.length > MAX_LABELS) {
    throw new InvalidLabelsError();
  }
  return cleaned;
}

export function toDto(task) {
  return {
    id: task._id.toString(),
    workspaceId: task.workspaceId.toString(),
    projectId: task.projectId.toString(),
    title: task.title,
    description: task.description ?? null,
    status: task.status,
    assigneeId: task.assigneeId ? task.assigneeId.toString() : null,
    priority: task.priority,
    startDate: task.startDate ?? null,
    dueDate: task.dueDate ?? null,
    labels: task.labels ?? [],
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
export async function createTask(
  workspaceId,
  projectId,
  userId,
  { title, description, status, assigneeId, priority, startDate, dueDate, labels },
) {
  await assertValidAssignee(workspaceId, assigneeId);
  if (status !== undefined && !TASK_STATUSES.includes(status)) {
    throw new InvalidStatusError();
  }
  if (priority !== undefined && !TASK_PRIORITIES.includes(priority)) {
    throw new InvalidPriorityError();
  }

  const parsedStartDate = startDate !== undefined ? parseDateOnly(startDate) : undefined;
  const parsedDueDate = dueDate !== undefined ? parseDateOnly(dueDate) : undefined;
  assertValidDateRange(parsedStartDate ?? null, parsedDueDate ?? null);
  const cleanedLabels = sanitizeLabels(labels);

  const task = await insertTaskDocument({
    workspaceId,
    projectId,
    title,
    description,
    status,
    assigneeId: assigneeId ?? null,
    priority,
    startDate: parsedStartDate,
    dueDate: parsedDueDate,
    labels: cleanedLabels,
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
  if (updates.status !== undefined) {
    if (!TASK_STATUSES.includes(updates.status)) {
      throw new InvalidStatusError();
    }
    task.status = updates.status;
  }
  if (updates.priority !== undefined) {
    if (!TASK_PRIORITIES.includes(updates.priority)) {
      throw new InvalidPriorityError();
    }
    task.priority = updates.priority;
  }
  if (updates.labels !== undefined) {
    task.labels = sanitizeLabels(updates.labels);
  }

  const nextStartDate = updates.startDate !== undefined ? parseDateOnly(updates.startDate) : task.startDate;
  const nextDueDate = updates.dueDate !== undefined ? parseDateOnly(updates.dueDate) : task.dueDate;
  assertValidDateRange(nextStartDate, nextDueDate);
  if (updates.startDate !== undefined) task.startDate = nextStartDate;
  if (updates.dueDate !== undefined) task.dueDate = nextDueDate;

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
