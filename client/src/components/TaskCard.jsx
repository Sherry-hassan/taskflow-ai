import { useState } from 'react';
import Avatar from './Avatar.jsx';
import Badge from './Badge.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import TaskEditDialog from './TaskEditDialog.jsx';
import TaskForm from './TaskForm.jsx';
import { CalendarIcon, SparkleIcon, TrashIcon, PencilIcon } from './icons.jsx';

// UX-layer mirror of the server's authority rule (FR-031) — this is a
// convenience, NOT the enforcement: the server independently re-checks this
// on every request (see server/src/services/taskService.js's hasTaskAuthority)
// regardless of what this component renders.
function hasTaskAuthority(task, currentUserId, currentRole) {
  if (currentRole === 'owner' || currentRole === 'admin') return true;
  if (task.createdBy === currentUserId) return true;
  if (task.assigneeId === currentUserId) return true;
  return false;
}

const statusLabels = { todo: 'Todo', in_progress: 'In Progress', done: 'Done' };
const priorityLabels = { low: 'Low', medium: 'Medium', high: 'High', highest: 'Highest' };

function formatDate(date) {
  if (!date) return null;
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Date-only comparison in UTC-date terms (matches the server's storage
// convention, server/src/models/Task.js) — never compares against the
// viewer's local wall-clock time, only calendar dates.
function isOverdue(dueDate, status) {
  if (!dueDate || status === 'done') return false;
  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);
  return new Date(dueDate).getTime() < todayUtc.getTime();
}

// `assigneeEmail` is an optional display-only convenience: the task payload
// itself only carries assigneeId (server/src/models/Task.js), so the parent
// (ProjectPage) resolves it against the already-loaded members list. Never
// required — the component degrades cleanly without it.
export default function TaskCard({
  task,
  currentUserId,
  currentRole,
  onStatusChange,
  onDelete,
  onUpdate,
  assigneeEmail,
  members,
}) {
  const canModify = hasTaskAuthority(task, currentUserId, currentRole);
  const startLabel = formatDate(task.startDate);
  const dueLabel = formatDate(task.dueDate);
  const overdue = isOverdue(task.dueDate, task.status);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');

  async function handleConfirmDelete() {
    if (deleting) {
      // Prevents a duplicate request if Delete is somehow activated twice
      // (e.g. a stray keyboard repeat) before the first request resolves.
      return;
    }
    setDeleting(true);
    try {
      await onDelete(task.id);
    } catch {
      // Swallowed here deliberately: the parent (ProjectPage) is already
      // responsible for surfacing the error via its own banner. This
      // dialog's only job on failure is to stop showing "Deleting…" and
      // close, not to also report the error itself or leave an unhandled
      // rejection from this click handler.
    } finally {
      setDeleting(false);
      setConfirmOpen(false);
    }
  }

  async function handleEditSubmit(payload) {
    if (saving) {
      return;
    }
    setSaving(true);
    setEditError('');
    try {
      await onUpdate(task.id, payload);
      setEditOpen(false);
    } catch (err) {
      setEditError(err.message || 'Failed to save task');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="group rounded-xl border border-slate-200 bg-white p-3.5 transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-indigo-500/30">
      <span className="mb-2 flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium leading-snug text-slate-900">{task.title}</h3>
        <span className="flex shrink-0 items-center gap-1.5">
          {task.aiOriginated && (
            <span title="Created from an approved AI task plan" className="text-indigo-500">
              <SparkleIcon className="h-4 w-4" />
            </span>
          )}
          {canModify && (
            <button
              type="button"
              aria-label={`Edit ${task.title}`}
              onClick={() => setEditOpen(true)}
              className="rounded-md p-1 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            >
              <PencilIcon className="h-4 w-4" />
            </button>
          )}
          {canModify && (
            <button
              type="button"
              aria-label={`Delete ${task.title}`}
              onClick={() => setConfirmOpen(true)}
              className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-500/30"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          )}
        </span>
      </span>

      {task.description && (
        <p className="mb-3 line-clamp-2 text-xs text-slate-500">{task.description}</p>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {task.priority && (
          <Badge variant={`priority_${task.priority}`}>{priorityLabels[task.priority] ?? task.priority}</Badge>
        )}
        {startLabel && (
          <span className="inline-flex items-center gap-1 text-xs text-slate-400">
            <CalendarIcon className="h-3.5 w-3.5" />
            Starts {startLabel}
          </span>
        )}
        {dueLabel && (
          <span
            className={`inline-flex items-center gap-1 text-xs ${overdue ? 'font-medium text-red-600' : 'text-slate-400'}`}
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            {overdue ? 'Overdue ' : ''}
            {dueLabel}
          </span>
        )}
      </div>

      {task.labels?.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {task.labels.map((label) => (
            <span key={label} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              {label}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <Avatar email={assigneeEmail} size="sm" />
          <span className="truncate text-xs text-slate-500">{assigneeEmail || 'Unassigned'}</span>
        </div>

        {canModify ? (
          <select
            aria-label={`Status for ${task.title}`}
            value={task.status}
            onChange={(event) => onStatusChange(task.id, event.target.value)}
            className="h-8 shrink-0 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        ) : (
          <span role="note" className="shrink-0 text-xs text-slate-400">
            {statusLabels[task.status] ?? task.status}
          </span>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={`Delete "${task.title}"?`}
        description="This cannot be undone."
        confirmLabel="Delete"
        confirming={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmOpen(false)}
      />

      <TaskEditDialog open={editOpen} title={`Edit "${task.title}"`} onClose={() => setEditOpen(false)}>
        {editError && (
          <p role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {editError}
          </p>
        )}
        <TaskForm
          mode="edit"
          initialValues={task}
          members={members}
          submitting={saving}
          onSubmit={handleEditSubmit}
          onCancel={() => setEditOpen(false)}
        />
      </TaskEditDialog>
    </div>
  );
}
