import { Router } from 'express';
import * as aiRiskController from '../controllers/aiRiskController.js';
import { requireWorkspaceRole } from '../middleware/requireWorkspaceRole.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Mounted at /api/v1/workspaces/:workspaceId/projects/:projectId/ai/risk-assessments —
// mergeParams so requireWorkspaceRole (reads req.params.workspaceId) and the
// controller (reads req.params.projectId) both see the parent routers' params.
// requireAuth is already applied by the parent workspace router; not
// reapplied here (this router is never mounted standalone).
export function createAiRiskRouter() {
  const router = Router({ mergeParams: true });

  // FR-060: any workspace member with project access. No approval step at all
  // (FR-061) — there is no approve/reject endpoint here, unlike aiPlanRoutes.js.
  router.post('/', requireWorkspaceRole(), asyncHandler(aiRiskController.requestRisk));
  router.get('/', requireWorkspaceRole(), asyncHandler(aiRiskController.listRisks));
  router.get('/:artifactId', requireWorkspaceRole(), asyncHandler(aiRiskController.getRisk));

  return router;
}
