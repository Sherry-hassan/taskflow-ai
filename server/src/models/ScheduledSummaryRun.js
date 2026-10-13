import mongoose from 'mongoose';

// FR-105/106, database-design.md §10. Separate from AIArtifact so the
// idempotency key is enforced BEFORE any AIArtifact write is attempted, not as
// a side effect of one — the unique (projectId, weekKey) index below is what
// actually implements FR-105, not application-level dedup logic.
const scheduledSummaryRunSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    weekKey: { type: String, required: true },
    status: { type: String, enum: ['in_progress', 'succeeded', 'failed'], required: true, default: 'in_progress' },
    attempts: { type: Number, required: true, default: 0 },
    resultArtifactId: { type: mongoose.Schema.Types.ObjectId, ref: 'AIArtifact', default: null },
    lastFailureCategory: { type: String, default: null },
  },
  { timestamps: true },
);

scheduledSummaryRunSchema.index({ projectId: 1, weekKey: 1 }, { unique: true });

export const ScheduledSummaryRun = mongoose.model('ScheduledSummaryRun', scheduledSummaryRunSchema);
