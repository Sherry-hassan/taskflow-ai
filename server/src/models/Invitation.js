import mongoose from 'mongoose';

// FR-090–095. `role` excludes 'owner' — an invitation can never grant ownership
// directly (FR-098 handles ownership transfer separately, to an *existing* member).
// `status` has no stored 'expired' value — expiry is derived from `expiresAt` at
// read time (FR-092), so a document never needs an update just because time passed.
const invitationSchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
    invitedEmail: { type: String, required: true },
    role: { type: String, enum: ['admin', 'member'], required: true },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    tokenHash: { type: String, required: true, unique: true },
    status: { type: String, enum: ['pending', 'accepted', 'revoked'], required: true, default: 'pending' },
    expiresAt: { type: Date, required: true },
    acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    acceptedAt: { type: Date, default: null },
    revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Supports "does this email already have a pending invitation to this workspace" checks.
invitationSchema.index({ workspaceId: 1, invitedEmail: 1, status: 1 });

// Design decision (database-design.md §4): invitations are NOT TTL-deleted, unlike
// RefreshToken/PasswordResetToken — an invitation has audit value (who invited
// whom, at what role, whether it was ever accepted) that those don't.
export const Invitation = mongoose.model('Invitation', invitationSchema);
