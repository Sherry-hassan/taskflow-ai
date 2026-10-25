import * as taskService from '../services/taskService.js';

function handleTaskError(err, res) {
  if (err instanceof taskService.InvalidAssigneeError) {
    return res.status(400).json({ message: 'Proposed assignee is not a member of this workspace' });
  }
  if (err instanceof taskService.InvalidStatusError) {
    return res.status(400).json({ message: 'Invalid status' });
  }
  if (err instanceof taskService.InvalidPriorityError) {
    return res.status(400).json({ message: 'Invalid priority' });
  }
  if (err instanceof taskService.InvalidDateRangeError) {
    return res.status(400).json({ message: 'Due date cannot be earlier than start date' });
  }
  if (err instanceof taskService.InvalidLabelsError) {
    return res.status(400).json({ message: 'Invalid labels' });
  }
  if (err instanceof taskService.TaskNotFoundError) {
    return res.status(404).json({ message: 'Not found' });
  }
  if (
    err instanceof taskService.InsufficientTaskAuthorityError ||
    err instanceof taskService.AssigneeOnlySelfUnassignError
  ) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  return null;
}

export async function createTask(req, res) {
  const { title, description, status, assigneeId, priority, startDate, dueDate, labels } = req.body || {};
  if (!title) {
    return res.status(400).json({ message: 'title is required' });
  }
  try {
    const task = await taskService.createTask(
      req.auth.workspaceId,
      req.params.projectId,
      req.auth.userId,
      { title, description, status, assigneeId, priority, startDate, dueDate, labels },
    );
    return res.status(201).json(task);
  } catch (err) {
    const handled = handleTaskError(err, res);
    if (handled) return handled;
    throw err;
  }
}

export async function listTasks(req, res) {
  const tasks = await taskService.listTasks(req.auth.workspaceId, req.params.projectId);
  return res.status(200).json(tasks);
}

export async function updateTask(req, res) {
  const { title, description, status, assigneeId, priority, startDate, dueDate, labels } = req.body || {};
  const updates = {};
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (status !== undefined) updates.status = status;
  if (priority !== undefined) updates.priority = priority;
  if (labels !== undefined) updates.labels = labels;
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'assigneeId')) {
    updates.assigneeId = assigneeId;
  }
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'startDate')) {
    updates.startDate = startDate;
  }
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'dueDate')) {
    updates.dueDate = dueDate;
  }

  try {
    const task = await taskService.updateTask(
      req.auth.workspaceId,
      req.params.projectId,
      req.params.taskId,
      req.auth.userId,
      req.auth.role,
      updates,
    );
    return res.status(200).json(task);
  } catch (err) {
    const handled = handleTaskError(err, res);
    if (handled) return handled;
    throw err;
  }
}

export async function deleteTask(req, res) {
  try {
    await taskService.deleteTask(
      req.auth.workspaceId,
      req.params.projectId,
      req.params.taskId,
      req.auth.userId,
      req.auth.role,
    );
    return res.status(204).end();
  } catch (err) {
    const handled = handleTaskError(err, res);
    if (handled) return handled;
    throw err;
  }
}
