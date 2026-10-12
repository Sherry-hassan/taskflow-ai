import express from 'express';
import cookieParser from 'cookie-parser';
import { createAuthRouter } from './routes/authRoutes.js';
import { createWorkspaceRouter, createInvitationAcceptRouter } from './routes/workspaceRoutes.js';
import { createDiagnosticRouter } from './routes/diagnosticRoutes.js';

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

  // Minimal, non-leaking error handler (standard Express hygiene — never return a
  // stack trace to the client). Full sanitized-logging discipline across the whole
  // app is explicit M7 scope (implementation-plan.md v0.2 §9); not pulled forward here.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error('Unhandled error:', err.message);
    res.status(500).json({ message: 'Internal server error' });
  });

  return app;
}
