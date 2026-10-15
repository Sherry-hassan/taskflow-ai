import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { startTestDb, stopTestDb, clearTestDb } from '../test/testDb.js';
import { verifyAccessToken } from '../services/tokenService.js';
import * as notifications from '../services/notifications.js';

let app;

beforeAll(async () => {
  await startTestDb();
}, 60000);

// A fresh app per test — not just a fresh DB — because express-rate-limit's
// in-memory store is attached to the app instance and otherwise accumulates
// across unrelated tests (every test's login/reset attempts share the same
// source IP in Supertest, so a shared app would trip the IP limiter early).
beforeEach(() => {
  app = createApp();
});

afterEach(async () => {
  await clearTestDb();
});

afterAll(async () => {
  await stopTestDb();
});

function uniqueEmail(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

function decodeCsrfCookie(setCookieHeaders) {
  const csrfLine = setCookieHeaders.find((c) => c.startsWith('csrfToken='));
  return csrfLine.split(';')[0].split('=')[1];
}

async function signupAndLogin(agent, email, password = 'correct-horse-battery-staple') {
  await agent.post('/api/v1/auth/signup').send({ email, password }).expect(201);
  const loginRes = await agent.post('/api/v1/auth/login').send({ email, password }).expect(200);
  const csrfToken = decodeCsrfCookie(loginRes.headers['set-cookie']);
  return { loginRes, csrfToken };
}

describe('POST /auth/signup (FR-001)', () => {
  it('creates an account with a hashed password', async () => {
    const email = uniqueEmail('signup');
    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send({ email, password: 'correct-horse-battery-staple' })
      .expect(201);
    expect(res.body.email).toBe(email);
    expect(res.body).not.toHaveProperty('passwordHash');
  });

  it('rejects a duplicate email with 409 (US-001)', async () => {
    const email = uniqueEmail('dup');
    await request(app)
      .post('/api/v1/auth/signup')
      .send({ email, password: 'correct-horse-battery-staple' })
      .expect(201);
    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send({ email, password: 'a-different-password' })
      .expect(409);
    expect(res.body.message).toMatch(/already/i);
  });
});

describe('POST /auth/login (FR-002, FR-004, FR-007, US-002)', () => {
  it('returns an access token (no role claim) and sets refresh + CSRF cookies', async () => {
    const email = uniqueEmail('login');
    const password = 'correct-horse-battery-staple';
    await request(app).post('/api/v1/auth/signup').send({ email, password }).expect(201);

    const res = await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200);

    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user.email).toBe(email);

    const { userId } = verifyAccessToken(res.body.accessToken);
    expect(userId).toBeTruthy();

    const setCookie = res.headers['set-cookie'];
    expect(setCookie.some((c) => c.startsWith('refreshToken=') && c.includes('HttpOnly'))).toBe(
      true,
    );
    expect(setCookie.some((c) => c.startsWith('csrfToken=') && !c.includes('HttpOnly'))).toBe(
      true,
    );

    // Phase 3 regression: csrfToken must be readable via document.cookie from
    // ANY page a real SPA renders, not just one literally served from
    // /api/v1/auth — a Path scoped that narrowly makes the double-submit
    // header unconstructable by any actual browser client (found when the
    // Playwright harness's very first logout call failed with "CSRF token
    // missing or invalid"). refreshToken, the sensitive httpOnly cookie,
    // keeps its narrow path — only csrfToken's scope changed.
    const refreshCookieHeader = setCookie.find((c) => c.startsWith('refreshToken='));
    const csrfCookieHeader = setCookie.find((c) => c.startsWith('csrfToken='));
    expect(refreshCookieHeader).toMatch(/Path=\/api\/v1\/auth/i);
    // Path's value must be exactly "/" — not merely contain a leading slash,
    // which "/api/v1/auth" also would.
    expect(csrfCookieHeader).toMatch(/Path=\/(;|$)/i);
  });

  it('rejects wrong password and non-existent email with the identical generic message (US-002)', async () => {
    const email = uniqueEmail('badcreds');
    await request(app)
      .post('/api/v1/auth/signup')
      .send({ email, password: 'correct-horse-battery-staple' })
      .expect(201);

    const wrongPassword = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'totally-wrong' })
      .expect(401);
    const nonExistent = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: uniqueEmail('nobody'), password: 'whatever' })
      .expect(401);

    expect(wrongPassword.body.message).toBe(nonExistent.body.message);
  });

  // Folded into M1 per implementation-plan.md v0.2 §3 (threat-model.md §7 item 1).
  // test-strategy.md does not yet define this test formally — flagged there as a
  // follow-up; written here because it's required by M1's own exit criteria.
  it('rate-limits repeated failed logins for the same email (login rate-limiting)', async () => {
    const email = uniqueEmail('bruteforce');
    await request(app)
      .post('/api/v1/auth/signup')
      .send({ email, password: 'correct-horse-battery-staple' })
      .expect(201);

    for (let i = 0; i < 5; i += 1) {
      await request(app)
        .post('/api/v1/auth/login')
        .send({ email, password: 'wrong' })
        .expect(401);
    }
    await request(app).post('/api/v1/auth/login').send({ email, password: 'wrong' }).expect(429);
  });
});

describe('POST /auth/refresh (FR-005)', () => {
  it('rotates the refresh token on each use and issues a new access token', async () => {
    const agent = request.agent(app);
    const email = uniqueEmail('refresh');
    const { csrfToken } = await signupAndLogin(agent, email);

    const res = await agent.post('/api/v1/auth/refresh').set('X-CSRF-Token', csrfToken).expect(200);
    expect(res.body.accessToken).toBeTruthy();
  });

  it('rejects refresh/logout without a matching CSRF header (FR-008/NFR-011)', async () => {
    const agent = request.agent(app);
    const email = uniqueEmail('csrf');
    await signupAndLogin(agent, email);

    await agent.post('/api/v1/auth/refresh').expect(403);
    await agent.post('/api/v1/auth/logout').expect(403);
  });

  it('exactly one of two concurrent refresh requests on the same token succeeds (US-003)', async () => {
    const agent = request.agent(app);
    const email = uniqueEmail('race');
    const { csrfToken } = await signupAndLogin(agent, email);

    const [first, second] = await Promise.all([
      agent.post('/api/v1/auth/refresh').set('X-CSRF-Token', csrfToken),
      agent.post('/api/v1/auth/refresh').set('X-CSRF-Token', csrfToken),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 401]);
  });

  it('reusing an already-rotated token is rejected AND revokes the whole family (FR-005)', async () => {
    const email = uniqueEmail('reuse');
    const password = 'correct-horse-battery-staple';
    await request(app).post('/api/v1/auth/signup').send({ email, password }).expect(201);
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    const csrfToken = decodeCsrfCookie(loginRes.headers['set-cookie']);
    const originalRefreshCookie = loginRes.headers['set-cookie'].find((c) =>
      c.startsWith('refreshToken='),
    );

    // Rotate once (sequential, not concurrent — deterministic, no race window).
    const firstRefresh = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [originalRefreshCookie, `csrfToken=${csrfToken}`])
      .set('X-CSRF-Token', csrfToken)
      .expect(200);
    const newRefreshCookie = firstRefresh.headers['set-cookie'].find((c) =>
      c.startsWith('refreshToken='),
    );

    // Replay the ORIGINAL (now-stale) token — reuse detected.
    await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [originalRefreshCookie, `csrfToken=${csrfToken}`])
      .set('X-CSRF-Token', csrfToken)
      .expect(401);

    // The legitimately-issued successor token must now ALSO be rejected — the
    // entire family was revoked by the reuse (system-design.md §4's documented
    // tradeoff), not just the replayed token.
    await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [newRefreshCookie, `csrfToken=${csrfToken}`])
      .set('X-CSRF-Token', csrfToken)
      .expect(401);
  });
});

describe('POST /auth/logout (FR-003, FR-006)', () => {
  it('invalidates the current refresh token immediately', async () => {
    const agent = request.agent(app);
    const email = uniqueEmail('logout');
    const { csrfToken } = await signupAndLogin(agent, email);

    await agent.post('/api/v1/auth/logout').set('X-CSRF-Token', csrfToken).expect(204);
    // Logout also clears the CSRF cookie, so a follow-up refresh now fails at the
    // CSRF layer first (cookie gone) rather than reaching the refresh-token check —
    // 403, not 401. This is the correct, more defensive outcome.
    await agent.post('/api/v1/auth/refresh').set('X-CSRF-Token', csrfToken).expect(403);
  });
});

describe('POST /auth/password-reset/request and /confirm (FR-009)', () => {
  it('responds identically whether or not the email matches an account', async () => {
    const existingEmail = uniqueEmail('resetexists');
    await request(app)
      .post('/api/v1/auth/signup')
      .send({ email: existingEmail, password: 'correct-horse-battery-staple' })
      .expect(201);

    const forExisting = await request(app)
      .post('/api/v1/auth/password-reset/request')
      .send({ email: existingEmail })
      .expect(202);
    const forNonExistent = await request(app)
      .post('/api/v1/auth/password-reset/request')
      .send({ email: uniqueEmail('resetnobody') })
      .expect(202);

    expect(forExisting.body).toEqual(forNonExistent.body);
  });

  it('rate-limits repeated reset requests for the same email', async () => {
    const email = uniqueEmail('resetbrute');
    for (let i = 0; i < 5; i += 1) {
      await request(app).post('/api/v1/auth/password-reset/request').send({ email }).expect(202);
    }
    await request(app).post('/api/v1/auth/password-reset/request').send({ email }).expect(429);
  });

  it('completes a reset, consumes the token, and revokes all refresh tokens — while the already-issued access token remains independently valid until its own expiry (documented tradeoff, not a gap)', async () => {
    const email = uniqueEmail('resetflow');
    const password = 'correct-horse-battery-staple';
    await request(app).post('/api/v1/auth/signup').send({ email, password }).expect(201);
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    const accessTokenIssuedBeforeReset = loginRes.body.accessToken;
    const refreshCookie = loginRes.headers['set-cookie'].find((c) => c.startsWith('refreshToken='));
    const csrfToken = decodeCsrfCookie(loginRes.headers['set-cookie']);

    // Intercept the (stubbed, M2) email-send call to capture the raw token — exactly
    // test-strategy.md §7's pattern: "tests assert an email send was requested with
    // the correct recipient/token," not that a real email was delivered.
    const sendSpy = vi.spyOn(notifications, 'sendPasswordResetEmail').mockResolvedValue();
    await request(app).post('/api/v1/auth/password-reset/request').send({ email }).expect(202);
    expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({ to: email }));
    const { token: rawToken } = sendSpy.mock.calls[0][0];
    sendSpy.mockRestore();

    const newPassword = 'a-brand-new-correct-password';
    await request(app)
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token: rawToken, newPassword })
      .expect(204);

    // Old password no longer works; new one does.
    await request(app).post('/api/v1/auth/login').send({ email, password }).expect(401);
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: newPassword })
      .expect(200);

    // All refresh tokens issued before the reset are revoked.
    await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [refreshCookie, `csrfToken=${csrfToken}`])
      .set('X-CSRF-Token', csrfToken)
      .expect(401);

    // The access token issued before the reset is NOT independently revocable
    // (FR-004) and remains cryptographically valid until its own natural expiry —
    // verified at the same function any future protected route would call, since
    // M1 has no protected route yet to exercise this black-box over HTTP.
    expect(() => verifyAccessToken(accessTokenIssuedBeforeReset)).not.toThrow();
  });

  it('rejects an expired, already-used, or invalid reset token (US-007)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token: 'not-a-real-token', newPassword: 'whatever123' })
      .expect(400);
    expect(res.body.message).toMatch(/expired|used|invalid/i);
  });
});
