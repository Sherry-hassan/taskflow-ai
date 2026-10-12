import * as workspaceService from '../services/workspaceService.js';

export async function createWorkspace(req, res) {
  const { name } = req.body || {};
  if (!name) {
    return res.status(400).json({ message: 'name is required' });
  }
  const workspace = await workspaceService.createWorkspace(req.auth.userId, name);
  return res.status(201).json(workspace);
}

export async function listMyWorkspaces(req, res) {
  const workspaces = await workspaceService.listWorkspacesForUser(req.auth.userId);
  return res.status(200).json(workspaces);
}

export async function listMembers(req, res) {
  const members = await workspaceService.listMembers(req.params.workspaceId);
  return res.status(200).json(members);
}

export async function changeMemberRole(req, res) {
  const { role } = req.body || {};
  if (!['admin', 'member'].includes(role)) {
    return res.status(400).json({ message: 'role must be admin or member' });
  }
  try {
    const membership = await workspaceService.changeMemberRole(
      req.params.workspaceId,
      req.auth.userId,
      req.params.userId,
      role,
    );
    return res.status(200).json(membership);
  } catch (err) {
    if (
      err instanceof workspaceService.InsufficientRoleAuthorityError ||
      err instanceof workspaceService.CannotTargetOwnerError
    ) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    throw err;
  }
}

export async function removeMember(req, res) {
  try {
    await workspaceService.removeMember(req.params.workspaceId, req.auth.userId, req.params.userId);
    return res.status(204).end();
  } catch (err) {
    if (
      err instanceof workspaceService.InsufficientRoleAuthorityError ||
      err instanceof workspaceService.CannotTargetOwnerError
    ) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    throw err;
  }
}

export async function transferOwnership(req, res) {
  const { toUserId } = req.body || {};
  if (!toUserId) {
    return res.status(400).json({ message: 'toUserId is required' });
  }
  try {
    const memberships = await workspaceService.transferOwnership(
      req.params.workspaceId,
      req.auth.userId,
      toUserId,
    );
    return res.status(200).json(memberships);
  } catch (err) {
    if (err instanceof workspaceService.NotOwnerError) {
      return res.status(403).json({ message: 'Only the current Owner may transfer ownership' });
    }
    if (err instanceof workspaceService.InvalidTransferTargetError) {
      return res
        .status(400)
        .json({ message: 'Target must be an existing member of this workspace' });
    }
    throw err;
  }
}
