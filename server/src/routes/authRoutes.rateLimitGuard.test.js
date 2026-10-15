import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// Covers the production backstop added alongside RATE_LIMIT_DISABLED: the
// env var is a Phase 3 Playwright-only escape hatch (authRoutes.js), and this
// proves NODE_ENV=production can't honor it even if something sets it there
// by mistake — the login IP limiter must still trip.
vi.mock('../controllers/authController.js', () => ({
  signup: (req, res) => res.status(201).end(),
  login: (req, res) => res.status(200).end(),
  refresh: (req, res) => res.status(200).end(),
  logout: (req, res) => res.status(204).end(),
  requestPasswordReset: (req, res) => res.status(202).end(),
  confirmPasswordReset: (req, res) => res.status(204).end(),
}));

const originalEnv = { ...process.env };

async function loadRouter() {
  vi.resetModules();
  const { createAuthRouter } = await import('./authRoutes.js');
  const app = express();
  app.use(express.json());
  app.use('/auth', createAuthRouter());
  return app;
}

async function hitLoginUntilRateLimited(app, attempts = 11) {
  let last;
  for (let i = 0; i < attempts; i += 1) {
    // Distinct emails so only the per-IP limiter (max 10), not the per-email
    // one, is what can trip here.
    last = await request(app).post('/auth/login').send({ email: `u${i}@example.com`, password: 'x' });
  }
  return last;
}

describe('RATE_LIMIT_DISABLED production backstop', () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('still rate-limits /auth/login when NODE_ENV=production, even if RATE_LIMIT_DISABLED=true', async () => {
    process.env.NODE_ENV = 'production';
    process.env.RATE_LIMIT_DISABLED = 'true';
    const app = await loadRouter();

    const res = await hitLoginUntilRateLimited(app);
    expect(res.status).toBe(429);
  });

  it('honors RATE_LIMIT_DISABLED=true outside production', async () => {
    process.env.NODE_ENV = 'test';
    process.env.RATE_LIMIT_DISABLED = 'true';
    const app = await loadRouter();

    const res = await hitLoginUntilRateLimited(app);
    expect(res.status).toBe(200);
  });

  it('rate-limits by default outside production when RATE_LIMIT_DISABLED is unset', async () => {
    delete process.env.RATE_LIMIT_DISABLED;
    process.env.NODE_ENV = 'test';
    const app = await loadRouter();

    const res = await hitLoginUntilRateLimited(app);
    expect(res.status).toBe(429);
  });
});
