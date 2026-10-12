import { Router } from 'express';
import { AIArtifact } from '../models/AIArtifact.js';
import { DiagnosticAccessLog } from '../models/DiagnosticAccessLog.js';
import { requireOperatorAuth } from '../middleware/requireOperatorAuth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Not mounted under /api/v1 — deliberately outside the product API surface
// (openapi.yaml's own header note: this route is intentionally excluded from
// that contract). FR-125/US-066: every read is itself logged and auditable.
export function createDiagnosticRouter() {
  const router = Router();
  router.use(requireOperatorAuth);

  router.get(
    '/artifacts/:artifactId/raw-output',
    asyncHandler(async (req, res) => {
      const artifact = await AIArtifact.findById(req.params.artifactId);
      if (!artifact) {
        return res.status(404).json({ message: 'Not found' });
      }

      await DiagnosticAccessLog.create({
        artifactId: artifact._id,
        accessedBy: req.operator.id,
        accessedAt: new Date(),
      });

      return res.status(200).json({
        artifactId: artifact._id.toString(),
        type: artifact.type,
        state: artifact.state,
        rawOutput: artifact.rawOutput,
      });
    }),
  );

  return router;
}
