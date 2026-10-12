import mongoose from 'mongoose';

// FR-020–022, FR-103. No "deleted" state exists in v1 (PRD §4.2 — permanent
// deletion out of scope) — `archived` is the only lifecycle flag.
const projectSchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
    name: { type: String, required: true },
    description: { type: String },
    archived: { type: Boolean, required: true, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Updated whenever a Task under this project is created or updated — exactly
    // the field FR-103's "active project" eligibility check (future M6) reads.
    // Denormalized here so that query doesn't have to scan Task for every project.
    lastTaskActivityAt: { type: Date, default: null },
  },
  { timestamps: true },
);

projectSchema.index({ workspaceId: 1 });
projectSchema.index({ archived: 1, lastTaskActivityAt: 1 });

export const Project = mongoose.model('Project', projectSchema);
