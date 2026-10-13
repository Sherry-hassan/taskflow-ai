import express from 'express';
import cookieParser from 'cookie-parser';
import { createAuthRouter } from './routes/authRoutes.js';
import { createWorkspaceRouter, createInvitationAcceptRouter } from './routes/workspaceRoutes.js';
import { createDiagnosticRouter } from './routes/diagnosticRoutes.js';
import { logAppError } from './utils/errorLogging.js';

export function createApp() {
  const app = express();

  app.use(express.json());
  app.use(cookieParser());

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/api/v1/auth', createAuthRouter());
  app.use('/api/v1/workspaces', createWorkspaceRouter());
  app.use('/api/v1/invitations', createInvitationAcceptRouter());
  // Not under /api/v1 — deliberately outside the product API surface (see
  // diagnosticRoutes.js's own header note).
  app.use('/internal/diagnostics', createDiagnosticRouter());

  // Non-leaking error handler (standard Express hygiene — never return a stack
  // trace to the client). FR-125's sanitized-logging discipline, previously
  // specific to AI failures, now applies here too (implementation-plan.md v0.2
  // §9, M7) — logAppError never receives err.message or err.stack, only an
  // explicit allow-list of non-sensitive fields.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    logAppError({ name: err.name || 'Error', method: req.method, path: req.path, statusCode: 500 });
    res.status(500).json({ message: 'Internal server error' });
  });

  return app;
}
