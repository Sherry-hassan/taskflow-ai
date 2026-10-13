import * as summaryService from '../services/summaryService.js';

export async function requestSummary(req, res) {
  try {
    const artifact = await summaryService.requestSummary(
      req.auth.workspaceId,
      req.params.projectId,
      req.auth.userId,
    );
    return res.status(202).json(artifact);
  } catch (err) {
    if (err instanceof summaryService.SummaryGenerationFailedError) {
      // FR-125/US-066: a generic message regardless of the underlying cause
      // (provider/network failure vs. schema-invalid output).
      return res.status(502).json({ message: 'AI service temporarily unavailable, please try again' });
    }
    if (err instanceof summaryService.ArtifactNotFoundError) {
      return res.status(404).json({ message: 'Not found' });
    }
    throw err;
  }
}

export async function listSummaries(req, res) {
  const artifacts = await summaryService.listSummaries(req.auth.workspaceId, req.params.projectId);
  return res.status(200).json(artifacts);
}

export async function getSummary(req, res) {
  try {
    const artifact = await summaryService.getSummary(
      req.auth.workspaceId,
      req.params.projectId,
      req.params.artifactId,
    );
    return res.status(200).json(artifact);
  } catch (err) {
    if (err instanceof summaryService.ArtifactNotFoundError) {
      return res.status(404).json({ message: 'Not found' });
    }
    throw err;
  }
}
