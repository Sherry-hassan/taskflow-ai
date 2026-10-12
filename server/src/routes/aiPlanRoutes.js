import { Router } from 'express';
import * as aiPlanController from '../controllers/aiPlanController.js';
import { requireWorkspaceRole } from '../middleware/requireWorkspaceRole.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Mounted at /api/v1/workspaces/:workspaceId/projects/:projectId/ai/plans —
// mergeParams so requireWorkspaceRole (reads req.params.workspaceId) and the
// controller (reads req.params.projectId) both see the parent routers' params.
// requireAuth is already applied by the parent workspace router; not
// reapplied here (this router is never mounted standalone).
export function createAiPlanRouter() {
  const router = Router({ mergeParams: true });

  // FR-050: any workspace member with project access.
  router.post('/', requireWorkspaceRole(), asyncHandler(aiPlanController.requestPlan));
  router.get('/', requireWorkspaceRole(), asyncHandler(aiPlanController.listPlans));
  router.get('/:artifactId', requireWorkspaceRole(), asyncHandler(aiPlanController.getPlan));

  // FR-055: Owner/Admin only at the route level (defense in depth); the
  // service re-checks this fresh, inside the transaction, at commit time —
  // that inner check, not this one, is what closes the TOCTOU gap.
  router.post(
    '/:artifactId/approve',
    requireWorkspaceRole('owner', 'admin'),
    asyncHandler(aiPlanController.approvePlan),
  );
  router.post(
    '/:artifactId/reject',
    requireWorkspaceRole('owner', 'admin'),
    asyncHandler(aiPlanController.rejectPlan),
  );

  return router;
}
