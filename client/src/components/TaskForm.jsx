import { useState } from 'react';
import { PlusIcon, CloseIcon } from './icons.jsx';

// Shared create/edit task form (Jira-style fields). No form/validation
// library is installed in this client (CLAUDE.md's dependency-minimization
// rule) — validation here is manual, matching every other form in the app.
// The server independently re-validates everything (taskService.js) —
// this is a UX convenience, never the enforcement.

const STATUS_OPTIONS = [
  { value: 'todo', label: 'Todo' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
];

// Order matches the server's rank (low < medium < high < highest), not
// alphabetical — server/src/models/Task.js TASK_PRIORITIES.
const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'highest', label: 'Highest' },
];

// Dates are date-only (no time-of-day) end to end — native <input type="date">
// already works in "YYYY-MM-DD" strings, which is exactly what the server's
// date-only convention expects (taskService.js parseDateOnly).
function toDateInputValue(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

export default function TaskForm({ mode = 'create', initialValues, members, submitting, onSubmit, onCancel }) {
  const [title, setTitle] = useState(initialValues?.title ?? '');
  const [description, setDescription] = useState(initialValues?.description ?? '');
  const [status, setStatus] = useState(initialValues?.status ?? 'todo');
  const [priority, setPriority] = useState(initialValues?.priority ?? 'medium');
  const [startDate, setStartDate] = useState(toDateInputValue(initialValues?.startDate));
  const [dueDate, setDueDate] = useState(toDateInputValue(initialValues?.dueDate));
  const [assigneeId, setAssigneeId] = useState(initialValues?.assigneeId ?? '');
  const [validationError, setValidationError] = useState('');

  const idPrefix = mode === 'edit' ? `edit-task-${initialValues?.id ?? ''}` : 'task';

  function handleSubmit(event) {
    event.preventDefault();
    if (!title.trim()) {
      setValidationError('Task title is required.');
      return;
    }
    if (startDate && dueDate && dueDate < startDate) {
      setValidationError('Due date cannot be earlier than start date.');
      return;
    }
    setValidationError('');
    onSubmit({
      title: title.trim(),
      description: description.trim(),
      status,
      priority,
      assigneeId: assigneeId || null,
      startDate: startDate || null,
      dueDate: dueDate || null,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
      {validationError && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {validationError}
        </p>
      )}

      <div>
        <label htmlFor={`${idPrefix}-title`} className="mb-1 block text-xs font-medium text-slate-500">
          Task title
        </label>
        <input
          id={`${idPrefix}-title`}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Task title"
          required
          className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
      </div>

      <div>
        <label htmlFor={`${idPrefix}-description`} className="mb-1 block text-xs font-medium text-slate-500">
          Description
        </label>
        <textarea
          id={`${idPrefix}-description`}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Optional description"
          rows={2}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label htmlFor={`${idPrefix}-status`} className="mb-1 block text-xs font-medium text-slate-500">
            Status
          </label>
          <select
            id={`${idPrefix}-status`}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="h-10 w-full rounded-lg border border-slate-300 px-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={`${idPrefix}-priority`} className="mb-1 block text-xs font-medium text-slate-500">
            Priority
          </label>
          <select
            id={`${idPrefix}-priority`}
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
            required
            className="h-10 w-full rounded-lg border border-slate-300 px-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            {PRIORITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={`${idPrefix}-start-date`} className="mb-1 block text-xs font-medium text-slate-500">
            Start date
          </label>
          <div className="flex items-center gap-1">
            <input
              id={`${idPrefix}-start-date`}
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="h-10 w-full rounded-lg border border-slate-300 px-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
            {startDate && (
              <button
                type="button"
                aria-label="Clear start date"
                onClick={() => setStartDate('')}
                className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <div>
          <label htmlFor={`${idPrefix}-due-date`} className="mb-1 block text-xs font-medium text-slate-500">
            Due date
          </label>
          <div className="flex items-center gap-1">
            <input
              id={`${idPrefix}-due-date`}
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              min={startDate || undefined}
              className="h-10 w-full rounded-lg border border-slate-300 px-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
            {dueDate && (
              <button
                type="button"
                aria-label="Clear due date"
                onClick={() => setDueDate('')}
                className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div>
        <label htmlFor={`${idPrefix}-assignee`} className="mb-1 block text-xs font-medium text-slate-500">
          Assignee
        </label>
        <select
          id={`${idPrefix}-assignee`}
          value={assigneeId}
          onChange={(event) => setAssigneeId(event.target.value)}
          className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 sm:w-auto"
        >
          <option value="">Unassigned</option>
          {members?.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.email}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="h-10 rounded-lg border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {mode === 'create' && <PlusIcon className="h-4 w-4" />}
          {mode === 'create'
            ? submitting
              ? 'Adding…'
              : 'Add task'
            : submitting
              ? 'Saving…'
              : 'Save changes'}
        </button>
      </div>
    </form>
  );
}
