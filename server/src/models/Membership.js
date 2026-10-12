import mongoose from 'mongoose';

// FR-012–014, FR-096–099. The three roles named in PRD §3; no `viewer` (explicitly
// out of scope, PRD §4.2).
const membershipSchema = new mongoose.Schema(
  {
    workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['owner', 'admin', 'member'], required: true },
  },
  { timestamps: true },
);

// A user has exactly one role per workspace (FR-014).
membershipSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });
// Supports the Owner lookup used by ownership transfer (FR-098) and the
// last-Owner check (FR-099) without a collection scan.
membershipSchema.index({ workspaceId: 1, role: 1 });
// Supports "list my workspaces" (FR-014) without a collection scan.
membershipSchema.index({ userId: 1 });

// Invariant enforced at the service layer, not by a schema constraint
// (database-design.md §3): exactly one Membership per workspace has role:
// 'owner' at all times. MongoDB has no native "exactly one" constraint across
// documents — transferOwnership's transaction is what guarantees this.
export const Membership = mongoose.model('Membership', membershipSchema);
