import * as aiOrchestrationService from '../services/aiOrchestrationService.js';

export async function requestPlan(req, res) {
  const { goalDescription } = req.body || {};
  if (!goalDescription) {
    return res.status(400).json({ message: 'goalDescription is required' });
  }
  try {
    const artifact = await aiOrchestrationService.requestPlanSuggestion(
      req.auth.workspaceId,
      req.params.projectId,
      req.auth.userId,
      goalDescription,
    );
    return res.status(202).json(artifact);
  } catch (err) {
    if (err instanceof aiOrchestrationService.PlanGenerationFailedError) {
      // FR-125/US-066: a generic message regardless of the underlying cause
      // (provider/network failure vs. schema-invalid output) — the distinction
      // is never exposed to the requester, only to the restricted diagnostic path.
      return res.status(502).json({ message: 'AI service temporarily unavailable, please try again' });
    }
    if (err instanceof aiOrchestrationService.ArtifactNotFoundError) {
      return res.status(404).json({ message: 'Not found' });
    }
    throw err;
  }
}

export async function listPlans(req, res) {
  const artifacts = await aiOrchestrationService.listPlanSuggestions(
    req.auth.workspaceId,
    req.params.projectId,
  );
  return res.status(200).json(artifacts);
}

export async function getPlan(req, res) {
  try {
    const artifact = await aiOrchestrationService.getPlanSuggestion(
      req.auth.workspaceId,
      req.params.projectId,
      req.params.artifactId,
    );
    return res.status(200).json(artifact);
  } catch (err) {
    if (err instanceof aiOrchestrationService.ArtifactNotFoundError) {
      return res.status(404).json({ message: 'Not found' });
    }
    throw err;
  }
}

export async function approvePlan(req, res) {
  try {
    const artifact = await aiOrchestrationService.approvePlanSuggestion(
      req.auth.workspaceId,
      req.params.projectId,
      req.params.artifactId,
      req.auth.userId,
    );
    return res.status(200).json(artifact);
  } catch (err) {
    if (err instanceof aiOrchestrationService.InsufficientApprovalAuthorityError) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    if (err instanceof aiOrchestrationService.PlanNotPendingError) {
      return res
        .status(409)
        .json({ message: 'Suggestion is no longer pending_review' });
    }
    if (err instanceof aiOrchestrationService.RevalidationFailedError) {
      return res
        .status(422)
        .json({ message: "Project state has changed since the suggestion was generated" });
    }
    throw err;
  }
}

export async function rejectPlan(req, res) {
  try {
    const artifact = await aiOrchestrationService.rejectPlanSuggestion(
      req.auth.workspaceId,
      req.params.projectId,
      req.params.artifactId,
      req.auth.userId,
    );
    return res.status(200).json(artifact);
  } catch (err) {
    if (err instanceof aiOrchestrationService.InsufficientApprovalAuthorityError) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    if (err instanceof aiOrchestrationService.PlanNotPendingError) {
      return res
        .status(409)
        .json({ message: 'Suggestion is no longer pending_review' });
    }
    throw err;
  }
}
