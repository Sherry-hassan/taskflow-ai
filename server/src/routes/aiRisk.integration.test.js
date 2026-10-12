import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../services/aiProvider.js', async () => {
  const actual = await vi.importActual('../services/aiProvider.js');
  return { ...actual, callClaude: vi.fn() };
});

import { callClaude } from '../services/aiProvider.js';
import { createApp } from '../app.js';
import { startTestDb, stopTestDb, clearTestDb } from '../test/testDb.js';
import { AIArtifact } from '../models/AIArtifact.js';

let app;

beforeAll(async () => {
  await startTestDb();
}, 60000);

beforeEach(() => {
  app = createApp();
  callClaude.mockReset();
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

async function signupAndGetToken(email, password = 'correct-horse-battery-staple') {
  await request(app).post('/api/v1/auth/signup').send({ email, password }).expect(201);
  const res = await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200);
  return { userId: res.body.user.id, accessToken: res.body.accessToken, email };
}

function authed(req, accessToken) {
  return req.set('Authorization', `Bearer ${accessToken}`);
}

async function setupProjectWithOwnerAndMember() {
  const owner = await signupAndGetToken(uniqueEmail('owner'));
  const wsRes = await authed(request(app).post('/api/v1/workspaces'), owner.accessToken)
    .send({ name: 'Acme' })
    .expect(201);
  const workspaceId = wsRes.body.id;

  const notifications = await import('../services/notifications.js');
  const sendSpy = vi.spyOn(notifications, 'sendInvitationEmail').mockResolvedValue();
  const memberEmail = uniqueEmail('member');
  await authed(request(app).post(`/api/v1/workspaces/${workspaceId}/invitations`), owner.accessToken)
    .send({ email: memberEmail, role: 'member' })
    .expect(201);
  const token = sendSpy.mock.calls[0][0].token;
  sendSpy.mockRestore();
  const member = await signupAndGetToken(memberEmail);
  await authed(request(app).post(`/api/v1/invitations/${token}/accept`), member.accessToken).expect(200);

  const proj = await authed(
    request(app).post(`/api/v1/workspaces/${workspaceId}/projects`),
    owner.accessToken,
  )
    .send({ name: 'P1' })
    .expect(201);

  return { owner, member, workspaceId, projectId: proj.body.id };
}

const riskPath = (workspaceId, projectId, suffix = '') =>
  `/api/v1/workspaces/${workspaceId}/projects/${projectId}/ai/risk-assessments${suffix}`;

describe('POST .../ai/risk-assessments — request a risk assessment (FR-060/061)', () => {
  it('a schema-valid response moves directly to generated — no approval step', async () => {
    const { owner, workspaceId, projectId } = await setupProjectWithOwnerAndMember();
    callClaude.mockResolvedValue(
      JSON.stringify({ summary: 'On track', risks: [{ description: 'Tight deadline', severity: 'medium' }] }),
    );

    const res = await authed(request(app).post(riskPath(workspaceId, projectId)), owner.accessToken).expect(
      202,
    );

    expect(res.body.state).toBe('generated');
    expect(res.body.validatedOutput.summary).toBe('On track');
    expect(res.body.validatedOutput.risks).toHaveLength(1);
    expect(res.body).not.toHaveProperty('rawOutput');
  });

  it('a Member (not just Owner/Admin) may request an assessment (FR-060)', async () => {
    const { member, workspaceId, projectId } = await setupProjectWithOwnerAndMember();
    callClaude.mockResolvedValue(JSON.stringify({ summary: 'ok', risks: [] }));
    await authed(request(app).post(riskPath(workspaceId, projectId)), member.accessToken).expect(202);
  });

  it('schema-invalid model output: artifact created with state invalid, generic error returned (Category B)', async () => {
    const { owner, workspaceId, projectId } = await setupProjectWithOwnerAndMember();
    callClaude.mockResolvedValue('this is not valid JSON at all');

    const res = await authed(request(app).post(riskPath(workspaceId, projectId)), owner.accessToken).expect(
      502,
    );
    expect(res.body.message).not.toMatch(/not valid JSON/);

    const artifacts = await AIArtifact.find({ workspaceId, projectId, type: 'risk' });
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].state).toBe('invalid');
    expect(artifacts[0].rawOutput).toBe('this is not valid JSON at all');
  });

  it('provider/network failure: NO artifact is created at all (Category A)', async () => {
    const { owner, workspaceId, projectId } = await setupProjectWithOwnerAndMember();
    const { AIProviderError } = await vi.importActual('../services/aiProvider.js');
    callClaude.mockRejectedValue(new AIProviderError('ECONNREFUSED'));

    const res = await authed(request(app).post(riskPath(workspaceId, projectId)), owner.accessToken).expect(
      502,
    );
    expect(res.body.message).not.toMatch(/ECONNREFUSED/);

    const artifacts = await AIArtifact.find({ workspaceId, projectId, type: 'risk' });
    expect(artifacts).toHaveLength(0);
  });

  it('a non-member cannot request a risk assessment for the project', async () => {
    const { workspaceId, projectId } = await setupProjectWithOwnerAndMember();
    const stranger = await signupAndGetToken(uniqueEmail('stranger'));
    await authed(request(app).post(riskPath(workspaceId, projectId)), stranger.accessToken).expect(403);
  });

  it('there is no approve/reject endpoint for a risk assessment (no approval step, FR-061)', async () => {
    const { owner, workspaceId, projectId } = await setupProjectWithOwnerAndMember();
    callClaude.mockResolvedValue(JSON.stringify({ summary: 'ok', risks: [] }));
    const res = await authed(request(app).post(riskPath(workspaceId, projectId)), owner.accessToken).expect(
      202,
    );
    const artifactId = res.body.id;

    await authed(
      request(app).post(riskPath(workspaceId, projectId, `/${artifactId}/approve`)),
      owner.accessToken,
    ).expect(404);
  });
});

describe('GET .../ai/risk-assessments — list and retrieve (FR-080 audit trail)', () => {
  it('lists risk assessments for the project and gets one by id, never exposing rawOutput', async () => {
    const { owner, workspaceId, projectId } = await setupProjectWithOwnerAndMember();
    callClaude.mockResolvedValue(JSON.stringify({ summary: 'ok', risks: [] }));
    const created = await authed(
      request(app).post(riskPath(workspaceId, projectId)),
      owner.accessToken,
    ).expect(202);

    const listRes = await authed(request(app).get(riskPath(workspaceId, projectId)), owner.accessToken).expect(
      200,
    );
    expect(listRes.body).toHaveLength(1);

    const getRes = await authed(
      request(app).get(riskPath(workspaceId, projectId, `/${created.body.id}`)),
      owner.accessToken,
    ).expect(200);
    expect(getRes.body.id).toBe(created.body.id);
    expect(getRes.body).not.toHaveProperty('rawOutput');
  });

  it('returns 404 for an artifact belonging to a different project', async () => {
    const { owner, workspaceId, projectId } = await setupProjectWithOwnerAndMember();
    callClaude.mockResolvedValue(JSON.stringify({ summary: 'ok', risks: [] }));
    await authed(request(app).post(riskPath(workspaceId, projectId)), owner.accessToken).expect(202);

    const otherProj = await authed(
      request(app).post(`/api/v1/workspaces/${workspaceId}/projects`),
      owner.accessToken,
    )
      .send({ name: 'P2' })
      .expect(201);

    const artifacts = await AIArtifact.find({ workspaceId, projectId, type: 'risk' });
    await authed(
      request(app).get(riskPath(workspaceId, otherProj.body.id, `/${artifacts[0]._id}`)),
      owner.accessToken,
    ).expect(404);
  });
});

describe('Restricted diagnostic access applies to risk artifacts too (FR-125, US-066)', () => {
  it('an invalid risk artifact’s raw output is reachable only via the operator-token diagnostic route', async () => {
    process.env.OPERATOR_DIAGNOSTIC_TOKEN = 'test-operator-secret';
    const { owner, workspaceId, projectId } = await setupProjectWithOwnerAndMember();
    callClaude.mockResolvedValue('not valid json');
    await authed(request(app).post(riskPath(workspaceId, projectId)), owner.accessToken).expect(502);

    const artifacts = await AIArtifact.find({ workspaceId, projectId, type: 'risk' });
    const invalidId = artifacts[0]._id.toString();

    await authed(
      request(app).get(`/internal/diagnostics/artifacts/${invalidId}/raw-output`),
      owner.accessToken,
    ).expect(401);

    const diagRes = await request(app)
      .get(`/internal/diagnostics/artifacts/${invalidId}/raw-output`)
      .set('X-Operator-Token', 'test-operator-secret')
      .set('X-Operator-Id', 'alice-oncall')
      .expect(200);
    expect(diagRes.body.rawOutput).toBe('not valid json');

    delete process.env.OPERATOR_DIAGNOSTIC_TOKEN;
  });
});
