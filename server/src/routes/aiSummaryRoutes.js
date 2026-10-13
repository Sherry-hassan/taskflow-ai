import { Router } from 'express';
import * as aiSummaryController from '../controllers/aiSummaryController.js';
import { requireWorkspaceRole } from '../middleware/requireWorkspaceRole.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Mounted at /api/v1/workspaces/:workspaceId/projects/:projectId/ai/summaries —
// mergeParams so requireWorkspaceRole (reads req.params.workspaceId) and the
// controller (reads req.params.projectId) both see the parent routers' params.
// requireAuth is already applied by the parent workspace router; not
// reapplied here (this router is never mounted standalone).
export function createAiSummaryRouter() {
  const router = Router({ mergeParams: true });

  // FR-070: any workspace member with project access. No approval step at all
  // (FR-072) — there is no approve/reject endpoint here, unlike aiPlanRoutes.js.
  // Scheduled summaries (FR-071) are never created through this router — the
  // Agenda job writes directly via summaryService.js.
  router.post('/', requireWorkspaceRole(), asyncHandler(aiSummaryController.requestSummary));
  router.get('/', requireWorkspaceRole(), asyncHandler(aiSummaryController.listSummaries));
  router.get('/:artifactId', requireWorkspaceRole(), asyncHandler(aiSummaryController.getSummary));

  return router;
}
