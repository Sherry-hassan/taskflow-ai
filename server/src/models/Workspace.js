import mongoose from 'mongoose';

// FR-010. Design decision (database-design.md §2) — no redundant `ownerId` field:
// the current Owner is derived by querying Membership for { workspaceId, role:
// 'owner' }, since Membership.role is already the single source of truth for who
// holds which role (FR-098/099). A second ownerId field would require every
// transfer to update two places atomically instead of one, for no benefit.
const workspaceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
  },
  { timestamps: true },
);

export const Workspace = mongoose.model('Workspace', workspaceSchema);
