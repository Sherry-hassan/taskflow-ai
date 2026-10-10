import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as authController from '../controllers/authController.js';
import { requireCsrf } from '../middleware/csrf.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

function emailKeyGenerator(req) {
  return String(req.body?.email || '').trim().toLowerCase();
}

// A factory, not a module-level singleton: express-rate-limit's in-memory store
// lives on the limiter instance, not the Express app. A module-level singleton
// router would make every createApp() call share the exact same limiter state
// forever (observed directly: a "fresh app per test" did not reset rate limits,
// because the router — and its limiters — were actually the same cached module
// object every time). Each createApp() call now gets fully independent state.
export function createAuthRouter() {
  // FR-009, folded into M1 scope: /auth/login mirrors the same per-email AND
  // per-source-IP pattern already specified for password-reset — two independent
  // limiters chained so that exceeding *either* blocks the request.
  const loginIpLimiter = rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
  });
  const loginEmailLimiter = rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: emailKeyGenerator,
  });

  const resetIpLimiter = rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
  });
  const resetEmailLimiter = rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: emailKeyGenerator,
  });

  const router = Router();

  router.post('/signup', asyncHandler(authController.signup));
  router.post('/login', loginIpLimiter, loginEmailLimiter, asyncHandler(authController.login));
  router.post('/refresh', requireCsrf, asyncHandler(authController.refresh));
  router.post('/logout', requireCsrf, asyncHandler(authController.logout));
  router.post(
    '/password-reset/request',
    resetIpLimiter,
    resetEmailLimiter,
    asyncHandler(authController.requestPasswordReset),
  );
  // No CSRF here — anonymous/token-authenticated, not cookie-authenticated (see
  // middleware/csrf.js's comment and test-strategy.md v0.3's revision note).
  router.post('/password-reset/confirm', asyncHandler(authController.confirmPasswordReset));

  return router;
}
