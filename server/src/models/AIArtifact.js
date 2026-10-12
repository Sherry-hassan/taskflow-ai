import mongoose from 'mongoose';

const aiArtifactSchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    type: { type: String, enum: ['plan', 'risk', 'summary'], required: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // A snapshot/reference of exactly the fields FR-121 allows into the prompt —
    // never credentials, tokens, or other-workspace data, by construction (the
    // orchestration module has no reference to anything else to put here).
    inputContextRef: { type: mongoose.Schema.Types.Mixed, required: true },
    // Required for EVERY document in this collection, not just certain states —
    // every row here resulted from an actual model response, valid or invalid
    // (FR-120). A provider/network/timeout failure (no response obtained at all)
    // never creates a row in the first place (system-design.md §9 Category A) —
    // so there is no reachable state where this would legitimately be absent.
    // Never included in any user-facing API response regardless of type/state
    // (system-design.md §11) — storage-only field.
    rawOutput: { type: String, required: true },
    validatedOutput: { type: mongoose.Schema.Types.Mixed },
    state: {
      type: String,
      enum: ['pending_review', 'approved', 'rejected', 'generated', 'invalid'],
      required: true,
    },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    rejectedAt: { type: Date, default: null },
    // Set only when type: 'summary' and scheduler-produced (M6).
    scheduledWeekKey: { type: String, default: null },
  },
  { timestamps: true },
);

aiArtifactSchema.index({ workspaceId: 1, projectId: 1 });
aiArtifactSchema.index({ projectId: 1, type: 1, state: 1 });

// Lifecycle invariant (database-design.md §9) — a plain `enum` can't express a
// per-`type` restriction, so this is a custom validator instead.
aiArtifactSchema.pre('validate', function enforceLifecycleInvariant(next) {
  const planStates = ['pending_review', 'approved', 'rejected', 'invalid'];
  const generatedOnlyStates = ['generated', 'invalid'];

  if (this.type === 'plan' && !planStates.includes(this.state)) {
    return next(new Error(`type 'plan' cannot have state '${this.state}'`));
  }
  if (this.type !== 'plan' && !generatedOnlyStates.includes(this.state)) {
    return next(new Error(`type '${this.type}' cannot have state '${this.state}'`));
  }
  if (this.type !== 'plan' && (this.approvedBy || this.rejectedBy)) {
    return next(new Error('approvedBy/rejectedBy can only be set when type is plan'));
  }
  return next();
});

export const AIArtifact = mongoose.model('AIArtifact', aiArtifactSchema);
