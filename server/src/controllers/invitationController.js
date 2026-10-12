import * as invitationService from '../services/invitationService.js';
import { User } from '../models/User.js';

export async function createInvitation(req, res) {
  const { email, role } = req.body || {};
  if (!email || !['admin', 'member'].includes(role)) {
    return res.status(400).json({ message: 'email and a valid role are required' });
  }
  try {
    const invitation = await invitationService.createInvitation(
      req.params.workspaceId,
      req.auth.userId,
      req.auth.role,
      email,
      role,
    );
    return res.status(201).json(invitation);
  } catch (err) {
    if (err instanceof invitationService.AdminCannotIssueAdminInviteError) {
      return res.status(403).json({ message: 'Only the Owner may issue an admin-level invitation' });
    }
    throw err;
  }
}

export async function listPendingInvitations(req, res) {
  const invitations = await invitationService.listPendingInvitations(req.params.workspaceId);
  return res.status(200).json(invitations);
}

export async function revokeInvitation(req, res) {
  try {
    await invitationService.revokeInvitation(
      req.params.workspaceId,
      req.auth.role,
      req.params.invitationId,
    );
    return res.status(204).end();
  } catch (err) {
    if (
      err instanceof invitationService.AdminCannotRevokeAdminInviteError ||
      err instanceof invitationService.InvalidInvitationTokenError
    ) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    throw err;
  }
}

export async function acceptInvitation(req, res) {
  const user = await User.findById(req.auth.userId);
  try {
    const membership = await invitationService.acceptInvitation(
      req.params.token,
      req.auth.userId,
      user.email,
    );
    return res.status(200).json(membership);
  } catch (err) {
    if (err instanceof invitationService.InvalidInvitationTokenError) {
      return res
        .status(400)
        .json({ message: 'Token expired, already used, revoked, or email mismatch' });
    }
    throw err;
  }
}
