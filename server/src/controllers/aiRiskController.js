import * as riskAssessmentService from '../services/riskAssessmentService.js';

export async function requestRisk(req, res) {
  try {
    const artifact = await riskAssessmentService.requestRiskAssessment(
      req.auth.workspaceId,
      req.params.projectId,
      req.auth.userId,
    );
    return res.status(202).json(artifact);
  } catch (err) {
    if (err instanceof riskAssessmentService.RiskGenerationFailedError) {
      // FR-125/US-066: a generic message regardless of the underlying cause
      // (provider/network failure vs. schema-invalid output).
      return res.status(502).json({ message: 'AI service temporarily unavailable, please try again' });
    }
    if (err instanceof riskAssessmentService.ArtifactNotFoundError) {
      return res.status(404).json({ message: 'Not found' });
    }
    throw err;
  }
}

export async function listRisks(req, res) {
  const artifacts = await riskAssessmentService.listRiskAssessments(
    req.auth.workspaceId,
    req.params.projectId,
  );
  return res.status(200).json(artifacts);
}

export async function getRisk(req, res) {
  try {
    const artifact = await riskAssessmentService.getRiskAssessment(
      req.auth.workspaceId,
      req.params.projectId,
      req.params.artifactId,
    );
    return res.status(200).json(artifact);
  } catch (err) {
    if (err instanceof riskAssessmentService.ArtifactNotFoundError) {
      return res.status(404).json({ message: 'Not found' });
    }
    throw err;
  }
}
