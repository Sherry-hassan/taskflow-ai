import { Router } from 'express';
import * as workspaceController from '../controllers/workspaceController.js';
import * as invitationController from '../controllers/invitationController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireWorkspaceRole } from '../middleware/requireWorkspaceRole.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// A factory, consistent with authRoutes.js's createAuthRouter — avoids any
// module-level singleton state (none is needed here, but the pattern is kept
// consistent across route modules).
export function createWorkspaceRouter() {
  const router = Router();

  router.use(requireAuth);

  router.post('/', asyncHandler(workspaceController.createWorkspace));
  router.get('/', asyncHandler(workspaceController.listMyWorkspaces));

  router.get(
    '/:workspaceId/members',
    requireWorkspaceRole(),
    asyncHandler(workspaceController.listMembers),
  );
  router.patch(
    '/:workspaceId/members/:userId',
    requireWorkspaceRole('owner'),
    asyncHandler(workspaceController.changeMemberRole),
  );
  router.delete(
    '/:workspaceId/members/:userId',
    requireWorkspaceRole('owner', 'admin'),
    asyncHandler(workspaceController.removeMember),
  );

  router.post(
    '/:workspaceId/transfer-ownership',
    requireWorkspaceRole('owner'),
    asyncHandler(workspaceController.transferOwnership),
  );

  router.post(
    '/:workspaceId/invitations',
    requireWorkspaceRole('owner', 'admin'),
    asyncHandler(invitationController.createInvitation),
  );
  router.get(
    '/:workspaceId/invitations',
    requireWorkspaceRole('owner', 'admin'),
    asyncHandler(invitationController.listPendingInvitations),
  );
  router.delete(
    '/:workspaceId/invitations/:invitationId',
    requireWorkspaceRole('owner', 'admin'),
    asyncHandler(invitationController.revokeInvitation),
  );

  return router;
}

// Not nested under /:workspaceId — the acceptor doesn't know the workspaceId
// ahead of time; they only have the token (FR-091).
export function createInvitationAcceptRouter() {
  const router = Router();
  router.use(requireAuth);
  router.post('/:token/accept', asyncHandler(invitationController.acceptInvitation));
  return router;
}
