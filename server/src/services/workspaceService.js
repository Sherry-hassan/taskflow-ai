import mongoose from 'mongoose';
import { Workspace } from '../models/Workspace.js';
import { Membership } from '../models/Membership.js';
// Not referenced directly — importing it registers the 'User' model with
// Mongoose so listMembers' .populate('userId') can resolve it regardless of
// module load order.
import '../models/User.js';

export class NotOwnerError extends Error {}
export class CannotTargetOwnerError extends Error {}
export class InsufficientRoleAuthorityError extends Error {}
export class InvalidTransferTargetError extends Error {}

// FR-010.
export async function createWorkspace(userId, name) {
  const workspace = await Workspace.create({ name });
  await Membership.create({ workspaceId: workspace._id, userId, role: 'owner' });
  return { id: workspace._id.toString(), name: workspace.name };
}

// FR-014.
export async function listWorkspacesForUser(userId) {
  const memberships = await Membership.find({ userId }).populate('workspaceId');
  return memberships.map((m) => ({
    workspace: { id: m.workspaceId._id.toString(), name: m.workspaceId.name },
    role: m.role,
  }));
}

// Phase 3 addition: populates each member's email so the client can render a
// human-readable member list / assignee picker — the API previously exposed
// only raw userIds. Additive only: every field listMembers already returned
// is unchanged; this adds `email` to the same response shape.
export async function listMembers(workspaceId) {
  const memberships = await Membership.find({ workspaceId }).populate('userId');
  return memberships.map((m) => ({
    userId: m.userId._id.toString(),
    workspaceId: m.workspaceId.toString(),
    role: m.role,
    email: m.userId.email,
  }));
}

// FR-012/096/097: Owner only. Changes a non-Owner member's role between admin
// and member. The Owner's own role is never changed through this endpoint —
// that's exclusively transferOwnership's job (FR-098).
export async function changeMemberRole(workspaceId, actingUserId, targetUserId, newRole) {
  const actingMembership = await Membership.findOne({ workspaceId, userId: actingUserId });
  if (!actingMembership || actingMembership.role !== 'owner') {
    throw new InsufficientRoleAuthorityError();
  }

  const targetMembership = await Membership.findOne({ workspaceId, userId: targetUserId });
  if (!targetMembership || targetMembership.role === 'owner') {
    throw new CannotTargetOwnerError();
  }

  targetMembership.role = newRole;
  await targetMembership.save();
  return {
    userId: targetMembership.userId.toString(),
    workspaceId: targetMembership.workspaceId.toString(),
    role: targetMembership.role,
  };
}

// FR-012: Owner may remove any non-Owner member (Admin or Member). An Admin
// may remove only a Member (never another Admin or the Owner).
export async function removeMember(workspaceId, actingUserId, targetUserId) {
  const actingMembership = await Membership.findOne({ workspaceId, userId: actingUserId });
  if (!actingMembership || !['owner', 'admin'].includes(actingMembership.role)) {
    throw new InsufficientRoleAuthorityError();
  }

  const targetMembership = await Membership.findOne({ workspaceId, userId: targetUserId });
  if (!targetMembership || targetMembership.role === 'owner') {
    throw new CannotTargetOwnerError();
  }
  if (actingMembership.role === 'admin' && targetMembership.role !== 'member') {
    throw new InsufficientRoleAuthorityError();
  }

  await Membership.deleteOne({ _id: targetMembership._id });
}

// FR-098/099: atomic, transactional transfer. Both authorization checks are
// re-read INSIDE the transaction, immediately before the writes (system-design.md
// §6) — not relied upon from an earlier middleware check — so the workspace is
// never observed with zero or two Owners mid-operation.
export async function transferOwnership(workspaceId, fromUserId, toUserId) {
  if (String(fromUserId) === String(toUserId)) {
    throw new InvalidTransferTargetError();
  }

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const fromMembership = await Membership.findOne({ workspaceId, userId: fromUserId }).session(
        session,
      );
      if (!fromMembership || fromMembership.role !== 'owner') {
        throw new NotOwnerError();
      }

      const toMembership = await Membership.findOne({ workspaceId, userId: toUserId }).session(
        session,
      );
      if (!toMembership) {
        throw new InvalidTransferTargetError();
      }

      await Membership.updateOne(
        { _id: fromMembership._id },
        { $set: { role: 'admin' } },
        { session },
      );
      await Membership.updateOne(
        { _id: toMembership._id },
        { $set: { role: 'owner' } },
        { session },
      );

      result = [
        { userId: String(fromUserId), workspaceId: String(workspaceId), role: 'admin' },
        { userId: String(toUserId), workspaceId: String(workspaceId), role: 'owner' },
      ];
    });
    return result;
  } finally {
    await session.endSession();
  }
}
