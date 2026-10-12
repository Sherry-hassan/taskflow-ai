import mongoose from 'mongoose';
import { Invitation } from '../models/Invitation.js';
import { Membership } from '../models/Membership.js';
import { generateToken, hashToken } from '../utils/crypto.js';
import { normalizeEmail } from '../utils/email.js';
import { sendInvitationEmail } from './notifications.js';

export class AdminCannotIssueAdminInviteError extends Error {}
export class AdminCannotRevokeAdminInviteError extends Error {}
export class InvalidInvitationTokenError extends Error {}

// FR-090: 7-day default.
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// FR-090/FR-011: Owner may invite at admin or member level; Admin may invite
// only at member level — rejected server-side if an Admin attempts an
// admin-level invitation, regardless of client-submitted data.
export async function createInvitation(workspaceId, inviterUserId, inviterRole, email, role) {
  if (role === 'admin' && inviterRole !== 'owner') {
    throw new AdminCannotIssueAdminInviteError();
  }

  const invitedEmail = normalizeEmail(email);
  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);

  const invitation = await Invitation.create({
    workspaceId,
    invitedEmail,
    role,
    invitedBy: inviterUserId,
    tokenHash,
    expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
  });

  await sendInvitationEmail({ to: invitedEmail, token: rawToken, workspaceId, role });

  return {
    id: invitation._id.toString(),
    workspaceId: invitation.workspaceId.toString(),
    invitedEmail: invitation.invitedEmail,
    role: invitation.role,
    status: invitation.status,
    expiresAt: invitation.expiresAt,
  };
}

export async function listPendingInvitations(workspaceId) {
  const invitations = await Invitation.find({ workspaceId, status: 'pending' });
  return invitations.map((inv) => ({
    id: inv._id.toString(),
    workspaceId: inv.workspaceId.toString(),
    invitedEmail: inv.invitedEmail,
    role: inv.role,
    status: inv.status,
    expiresAt: inv.expiresAt,
  }));
}

// FR-093: Owner may revoke any pending invitation (admin- or member-level).
// Admin may revoke only pending Member-level invitations — the same scope it
// is authorized to issue under FR-090, regardless of who originally issued
// it (US-017: the scope is level-based, not issuer-based).
export async function revokeInvitation(workspaceId, actingRole, invitationId) {
  const invitation = await Invitation.findOne({ _id: invitationId, workspaceId, status: 'pending' });
  if (!invitation) {
    throw new InvalidInvitationTokenError();
  }
  if (invitation.role === 'admin' && actingRole !== 'owner') {
    throw new AdminCannotRevokeAdminInviteError();
  }

  invitation.status = 'revoked';
  await invitation.save();
}

// FR-091/092: normalization-based exact match; expired/used/revoked rejected
// with the same error. FR-090/091's single-use consumption and the resulting
// Membership creation are atomic — wrapped in one transaction so an invitation
// can never end up "accepted" without the membership actually existing.
export async function acceptInvitation(rawToken, acceptingUserId, acceptingUserEmail) {
  const tokenHash = hashToken(rawToken);
  const now = new Date();
  const normalizedAcceptingEmail = normalizeEmail(acceptingUserEmail);

  const invitation = await Invitation.findOne({ tokenHash });
  if (
    !invitation ||
    invitation.status !== 'pending' ||
    invitation.expiresAt < now ||
    invitation.invitedEmail !== normalizedAcceptingEmail
  ) {
    throw new InvalidInvitationTokenError();
  }

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const consumed = await Invitation.findOneAndUpdate(
        { _id: invitation._id, status: 'pending' },
        { $set: { status: 'accepted', acceptedBy: acceptingUserId, acceptedAt: now } },
        { session },
      );
      if (!consumed) {
        // Reaccepted/raced — someone else already consumed this token.
        throw new InvalidInvitationTokenError();
      }

      const membership = await Membership.findOneAndUpdate(
        { workspaceId: invitation.workspaceId, userId: acceptingUserId },
        { $set: { role: invitation.role } },
        { upsert: true, new: true, session },
      );

      result = {
        userId: membership.userId.toString(),
        workspaceId: membership.workspaceId.toString(),
        role: membership.role,
      };
    });
    return result;
  } finally {
    await session.endSession();
  }
}
