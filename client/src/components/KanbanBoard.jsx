import TaskCard from './TaskCard.jsx';

// Mirrors the Task model's actual status enum exactly
// (server/src/models/Task.js TASK_STATUSES) — three columns, no more. There
// is no "Approved"/"Rejected" task status; that lifecycle belongs only to AI
// plan artifacts (see the AI Command Center), kept deliberately separate.
const COLUMNS = [
  { status: 'todo', label: 'To Do', dotClass: 'bg-amber-400' },
  { status: 'in_progress', label: 'In Progress', dotClass: 'bg-blue-400' },
  { status: 'done', label: 'Done', dotClass: 'bg-emerald-400' },
];

export default function KanbanBoard({ tasks, currentUserId, currentRole, membersByEmail, onStatusChange, onDelete }) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {COLUMNS.map((column) => {
        const columnTasks = tasks.filter((task) => task.status === column.status);
        return (
          <div key={column.status} className="flex w-72 shrink-0 flex-col rounded-xl bg-slate-100/70 p-3">
            <div className="mb-3 flex items-center gap-2 px-1">
              <span className={`h-2 w-2 rounded-full ${column.dotClass}`} aria-hidden="true" />
              <h3 className="text-sm font-semibold text-slate-700">{column.label}</h3>
              <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-500">
                {columnTasks.length}
              </span>
            </div>

            <div className="flex flex-1 flex-col gap-2.5">
              {columnTasks.length === 0 && (
                <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
                  No tasks here yet.
                </div>
              )}
              {columnTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  currentUserId={currentUserId}
                  currentRole={currentRole}
                  onStatusChange={onStatusChange}
                  onDelete={onDelete}
                  assigneeEmail={task.assigneeId ? membersByEmail?.[task.assigneeId] : null}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
