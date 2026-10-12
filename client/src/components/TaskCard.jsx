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

export default function TaskCard({ task, currentUserId, currentRole, onStatusChange }) {
  const canModify = hasTaskAuthority(task, currentUserId, currentRole);

  return (
    <div>
      <h3>{task.title}</h3>
      <p>Status: {task.status}</p>
      {canModify ? (
        <select
          aria-label={`Status for ${task.title}`}
          value={task.status}
          onChange={(event) => onStatusChange(task.id, event.target.value)}
        >
          <option value="todo">Todo</option>
          <option value="in_progress">In Progress</option>
          <option value="done">Done</option>
        </select>
      ) : (
        <p role="note">You don&apos;t have permission to change this task&apos;s status.</p>
      )}
    </div>
  );
}
