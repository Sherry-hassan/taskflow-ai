import { useState } from 'react';
import Avatar from './Avatar.jsx';
import Badge from './Badge.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import { CalendarIcon, SparkleIcon, TrashIcon } from './icons.jsx';

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

function formatDueDate(dueDate) {
  if (!dueDate) return null;
  return new Date(dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// `assigneeEmail` is an optional display-only convenience: the task payload
// itself only carries assigneeId (server/src/models/Task.js), so the parent
// (ProjectPage) resolves it against the already-loaded members list. Never
// required — the component degrades cleanly without it.
export default function TaskCard({ task, currentUserId, currentRole, onStatusChange, onDelete, assigneeEmail }) {
  const canModify = hasTaskAuthority(task, currentUserId, currentRole);
  const dueLabel = formatDueDate(task.dueDate);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
        <Badge variant={task.status}>Status: {task.status}</Badge>
        {dueLabel && (
          <span className="inline-flex items-center gap-1 text-xs text-slate-400">
            <CalendarIcon className="h-3.5 w-3.5" />
            {dueLabel}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
        <div className="flex items-center gap-1.5">
          <Avatar email={assigneeEmail} size="sm" />
          <span className="truncate text-xs text-slate-500">{assigneeEmail || 'Unassigned'}</span>
        </div>

        {canModify ? (
          <select
            aria-label={`Status for ${task.title}`}
            value={task.status}
            onChange={(event) => onStatusChange(task.id, event.target.value)}
            className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        ) : (
          <p role="note" className="text-xs text-slate-400">
            You don&apos;t have permission to change this task&apos;s status.
          </p>
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
    </div>
  );
}
