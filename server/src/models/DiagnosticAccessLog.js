import mongoose from 'mongoose';

// FR-125, US-066. `accessedBy` is an operator identity, not a User ref — per
// system-design.md §11, diagnostic access uses a distinct operator credential
// outside the product's workspace-role system entirely, so there is no User
// document to reference.
const diagnosticAccessLogSchema = new mongoose.Schema(
  {
    artifactId: { type: mongoose.Schema.Types.ObjectId, ref: 'AIArtifact', required: true },
    accessedBy: { type: String, required: true },
    accessedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

diagnosticAccessLogSchema.index({ artifactId: 1 });
diagnosticAccessLogSchema.index({ accessedAt: 1 });

export const DiagnosticAccessLog = mongoose.model('DiagnosticAccessLog', diagnosticAccessLogSchema);
