import mongoose from 'mongoose';

// Design decision (database-design.md §8): resolves the task status enum PRD §7
// deferred to this layer. Exactly the three states PRD FR-032 already used as its
// own illustrative example. Transitions are unrestricted — any status may move to
// any other (e.g. reopening a `done` task back to `todo` is allowed) — the PRD
// doesn't describe a workflow requiring restricted transitions.
export const TASK_STATUSES = ['todo', 'in_progress', 'done'];

// Jira-style task fields (database-design.md §8 revision). Explicit rank order
// (not alphabetical) so callers can sort by priority: low < medium < high < highest.
export const TASK_PRIORITIES = ['low', 'medium', 'high', 'highest'];
export const TASK_PRIORITY_RANK = Object.fromEntries(TASK_PRIORITIES.map((p, i) => [p, i]));

const taskSchema = new mongoose.Schema(
  {
    // Denormalized from Project, not only derivable via projectId → Project.workspaceId
    // — every query against this collection must filter by workspaceId directly
    // (system-design.md §5), which is only cheap if the field exists here.
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    title: { type: String, required: true },
    description: { type: String },
    status: { type: String, enum: TASK_STATUSES, required: true, default: 'todo' },
    // FR-033: must reference a user with an existing Membership in workspaceId —
    // enforced at the service layer, not a schema-level constraint (Mongoose can't
    // natively validate "this ID exists in a different collection with a matching
    // workspaceId" as a schema rule).
    assigneeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    priority: { type: String, enum: TASK_PRIORITIES, required: true, default: 'medium' },
    // Date-only values (no time-of-day): stored as UTC midnight of the chosen
    // calendar date so ordering/overdue comparisons never drift across
    // timezones (database-design.md §8 revision).
    startDate: { type: Date, default: null },
    dueDate: { type: Date, default: null },
    labels: { type: [String], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Set true only for tasks created via an approved plan suggestion (FR-052, M4).
    aiOriginated: { type: Boolean, required: true, default: false },
    sourceArtifactId: { type: mongoose.Schema.Types.ObjectId, ref: 'AIArtifact', default: null },
  },
  { timestamps: true },
);

taskSchema.index({ workspaceId: 1, projectId: 1 });
taskSchema.index({ assigneeId: 1 });
taskSchema.index({ projectId: 1, status: 1 });
taskSchema.index({ projectId: 1, priority: 1 });

export const Task = mongoose.model('Task', taskSchema);
