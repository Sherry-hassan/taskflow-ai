import { Router } from 'express';
import * as projectController from '../controllers/projectController.js';
import * as taskController from '../controllers/taskController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireWorkspaceRole } from '../middleware/requireWorkspaceRole.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { createAiPlanRouter } from './aiPlanRoutes.js';
import { createAiRiskRouter } from './aiRiskRoutes.js';
import { createAiSummaryRouter } from './aiSummaryRoutes.js';

// Mounted at /api/v1/workspaces/:workspaceId/projects — merged params so
// requireWorkspaceRole (which reads req.params.workspaceId) still works
// when this router is nested under workspaceRoutes.js's :workspaceId segment.
export function createProjectRouter() {
  const router = Router({ mergeParams: true });

  router.use(requireAuth);

  router.post('/', requireWorkspaceRole('owner', 'admin'), asyncHandler(projectController.createProject));
  router.get('/', requireWorkspaceRole(), asyncHandler(projectController.listProjects));
  router.get('/:projectId', requireWorkspaceRole(), asyncHandler(projectController.getProject));
  router.patch(
    '/:projectId',
    requireWorkspaceRole('owner', 'admin'),
    asyncHandler(projectController.updateProject),
  );
  router.post(
    '/:projectId/archive',
    requireWorkspaceRole('owner', 'admin'),
    asyncHandler(projectController.archiveProject),
  );

  router.post(
    '/:projectId/tasks',
    requireWorkspaceRole(),
    asyncHandler(taskController.createTask),
  );
  router.get(
    '/:projectId/tasks',
    requireWorkspaceRole(),
    asyncHandler(taskController.listTasks),
  );
  router.patch(
    '/:projectId/tasks/:taskId',
    requireWorkspaceRole(),
    asyncHandler(taskController.updateTask),
  );
  router.delete(
    '/:projectId/tasks/:taskId',
    requireWorkspaceRole(),
    asyncHandler(taskController.deleteTask),
  );

  router.use('/:projectId/ai/plans', createAiPlanRouter());
  router.use('/:projectId/ai/risk-assessments', createAiRiskRouter());
  router.use('/:projectId/ai/summaries', createAiSummaryRouter());

  return router;
}
