import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { startTestDb, stopTestDb, clearTestDb } from './test/testDb.js';

// M7 (implementation-plan.md v0.2 §9): FR-125's sanitized-logging discipline,
// previously specific to AI failures, now applies to the app's general
// catch-all error handler too. This exercises a REAL unhandled exception
// (a Mongoose CastError from a malformed ObjectId in a URL param) rather than
// a mocked one — the simplest naturally-occurring "unhandled exception in a
// non-AI code path" the threat-model.md §7 gap describes.
let app;

beforeAll(async () => {
  await startTestDb();
}, 60000);

beforeEach(() => {
  app = createApp();
});

afterEach(async () => {
  await clearTestDb();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await stopTestDb();
});

function uniqueEmail(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

async function signupAndGetToken(email, password = 'correct-horse-battery-staple') {
  await request(app).post('/api/v1/auth/signup').send({ email, password }).expect(201);
  const res = await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200);
  return { accessToken: res.body.accessToken };
}

describe('Unhandled exception in a real (non-AI) route — generic response, sanitized log', () => {
  it('a malformed assigneeId in the request BODY throws a Mongoose CastError caught generically, never logged', async () => {
    // The sentinel lives only in the request body, never in the URL — so if
    // it shows up in anything logged, that can only be because the raw
    // err.message (Mongoose's CastError embeds the offending value verbatim)
    // was logged, not the sanitized allow-list.
    const SENTINEL = 'sentinel-value-should-never-be-logged';
    const { accessToken } = await signupAndGetToken(uniqueEmail('owner'));
    const wsRes = await request(app)
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Acme' })
      .expect(201);
    const workspaceId = wsRes.body.id;
    const projRes = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/projects`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'P1' })
      .expect(201);
    const projectId = projRes.body.id;

    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/tasks`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'Task', assigneeId: SENTINEL })
      .expect(500);

    // Response never leaks the underlying error or the sentinel at all.
    expect(res.body).toEqual({ message: 'Internal server error' });
    expect(JSON.stringify(res.body)).not.toMatch(SENTINEL);

    // The log call happened, but the sentinel value never appears in what
    // was logged — proving the handler logs the sanitized allow-list, not
    // err.message (which DOES embed the sentinel, confirmed separately below).
    expect(spy).toHaveBeenCalled();
    const loggedText = spy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(loggedText).not.toMatch(SENTINEL);
    expect(loggedText).toMatch(/CastError/);
    expect(loggedText).toMatch(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/tasks`);
  });
});
