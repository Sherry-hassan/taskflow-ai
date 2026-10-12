import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../services/aiProvider.js', async () => {
  const actual = await vi.importActual('../services/aiProvider.js');
  return { ...actual, callClaude: vi.fn() };
});

import { callClaude } from '../services/aiProvider.js';
import { createApp } from '../app.js';
import { startTestDb, stopTestDb, clearTestDb } from '../test/testDb.js';
import * as taskService from '../services/taskService.js';
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

async function setupProjectWithOwnerAdminMember() {
  const owner = await signupAndGetToken(uniqueEmail('owner'));
  const wsRes = await authed(request(app).post('/api/v1/workspaces'), owner.accessToken)
    .send({ name: 'Acme' })
    .expect(201);
  const workspaceId = wsRes.body.id;

  const notifications = await import('../services/notifications.js');
  async function inviteAndAccept(email, role) {
    const sendSpy = vi.spyOn(notifications, 'sendInvitationEmail').mockResolvedValue();
    await authed(request(app).post(`/api/v1/workspaces/${workspaceId}/invitations`), owner.accessToken)
      .send({ email, role })
      .expect(201);
    const token = sendSpy.mock.calls[0][0].token;
    sendSpy.mockRestore();
    const acceptor = await signupAndGetToken(email);
    await authed(request(app).post(`/api/v1/invitations/${token}/accept`), acceptor.accessToken).expect(
      200,
    );
    return acceptor;
  }
  const admin = await inviteAndAccept(uniqueEmail('admin'), 'admin');
  const member = await inviteAndAccept(uniqueEmail('member'), 'member');

  const proj = await authed(
    request(app).post(`/api/v1/workspaces/${workspaceId}/projects`),
    owner.accessToken,
  )
    .send({ name: 'P1' })
    .expect(201);

  return { owner, admin, member, workspaceId, projectId: proj.body.id };
}

const planPath = (workspaceId, projectId, suffix = '') =>
  `/api/v1/workspaces/${workspaceId}/projects/${projectId}/ai/plans${suffix}`;

describe('POST .../ai/plans — request a plan suggestion (FR-050/051)', () => {
  it('a schema-valid response becomes pending_review with the parsed output', async () => {
    const { owner, workspaceId, projectId } = await setupProjectWithOwnerAdminMember();
    callClaude.mockResolvedValue(JSON.stringify({ tasks: [{ title: 'Design schema' }, { title: 'Build API' }] }));

    const res = await authed(request(app).post(planPath(workspaceId, projectId)), owner.accessToken)
      .send({ goalDescription: 'Ship the feature' })
      .expect(202);

    expect(res.body.state).toBe('pending_review');
    expect(res.body.validatedOutput.tasks).toHaveLength(2);
    expect(res.body).not.toHaveProperty('rawOutput');
  });

  it('schema-invalid model output: artifact created with state invalid, generic error returned (Category B)', async () => {
    const { owner, workspaceId, projectId } = await setupProjectWithOwnerAdminMember();
    callClaude.mockResolvedValue('this is not valid JSON at all');

    const res = await authed(request(app).post(planPath(workspaceId, projectId)), owner.accessToken)
      .send({ goalDescription: 'Ship the feature' })
      .expect(502);
    expect(res.body.message).not.toMatch(/not valid JSON/);

    const artifacts = await AIArtifact.find({ workspaceId, projectId, type: 'plan' });
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].state).toBe('invalid');
    expect(artifacts[0].rawOutput).toBe('this is not valid JSON at all');
  });

  it('provider/network failure: NO artifact is created at all (Category A)', async () => {
    const { owner, workspaceId, projectId } = await setupProjectWithOwnerAdminMember();
    const { AIProviderError } = await vi.importActual('../services/aiProvider.js');
    callClaude.mockRejectedValue(new AIProviderError('ECONNREFUSED'));

    const res = await authed(request(app).post(planPath(workspaceId, projectId)), owner.accessToken)
      .send({ goalDescription: 'Ship the feature' })
      .expect(502);
    expect(res.body.message).not.toMatch(/ECONNREFUSED/);

    const artifacts = await AIArtifact.find({ workspaceId, projectId, type: 'plan' });
    expect(artifacts).toHaveLength(0);
  });

  it('a Member (not just Owner/Admin) may request a suggestion (FR-050)', async () => {
    const { member, workspaceId, projectId } = await setupProjectWithOwnerAdminMember();
    callClaude.mockResolvedValue(JSON.stringify({ tasks: [{ title: 'A task' }] }));
    await authed(request(app).post(planPath(workspaceId, projectId)), member.accessToken)
      .send({ goalDescription: 'Goal' })
      .expect(202);
  });
});

describe('Plan approval — concurrency and safety (FR-052/055/056, US-048)', () => {
  async function createPendingSuggestion(owner, workspaceId, projectId, tasks) {
    callClaude.mockResolvedValue(JSON.stringify({ tasks }));
    const res = await authed(request(app).post(planPath(workspaceId, projectId)), owner.accessToken)
      .send({ goalDescription: 'Goal' })
      .expect(202);
    return res.body.id;
  }

  it('approving creates all proposed tasks, tagged AI-originated, linked to the artifact', async () => {
    const { owner, workspaceId, projectId } = await setupProjectWithOwnerAdminMember();
    const artifactId = await createPendingSuggestion(owner, workspaceId, projectId, [
      { title: 'Task A' },
      { title: 'Task B', description: 'details' },
    ]);

    const res = await authed(
      request(app).post(planPath(workspaceId, projectId, `/${artifactId}/approve`)),
      owner.accessToken,
    ).expect(200);
    expect(res.body.state).toBe('approved');

    const tasks = await authed(
      request(app).get(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/tasks`),
      owner.accessToken,
    ).expect(200);
    expect(tasks.body).toHaveLength(2);
    expect(tasks.body.every((t) => t.aiOriginated)).toBe(true);
    expect(tasks.body.every((t) => t.sourceArtifactId === artifactId)).toBe(true);
  });

  it('a Member cannot approve or reject, only Owner/Admin (FR-055)', async () => {
    const { owner, member, workspaceId, projectId } = await setupProjectWithOwnerAdminMember();
    const artifactId = await createPendingSuggestion(owner, workspaceId, projectId, [{ title: 'Task' }]);

    await authed(
      request(app).post(planPath(workspaceId, projectId, `/${artifactId}/approve`)),
      member.accessToken,
    ).expect(403);
    await authed(
      request(app).post(planPath(workspaceId, projectId, `/${artifactId}/reject`)),
      member.accessToken,
    ).expect(403);
  });

  it('rejecting discards the suggestion without creating any tasks; terminal state (FR-053/054)', async () => {
    const { owner, workspaceId, projectId } = await setupProjectWithOwnerAdminMember();
    const artifactId = await createPendingSuggestion(owner, workspaceId, projectId, [{ title: 'Task' }]);

    const res = await authed(
      request(app).post(planPath(workspaceId, projectId, `/${artifactId}/reject`)),
      owner.accessToken,
    ).expect(200);
    expect(res.body.state).toBe('rejected');

    const tasks = await authed(
      request(app).get(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/tasks`),
      owner.accessToken,
    ).expect(200);
    expect(tasks.body).toHaveLength(0);

    // Terminal — cannot later be approved.
    await authed(
      request(app).post(planPath(workspaceId, projectId, `/${artifactId}/approve`)),
      owner.accessToken,
    ).expect(409);
  });

  it('exactly one of two concurrent approve requests on the same suggestion succeeds (US-048)', async () => {
    const { owner, workspaceId, projectId } = await setupProjectWithOwnerAdminMember();
    const artifactId = await createPendingSuggestion(owner, workspaceId, projectId, [{ title: 'Task' }]);

    const [first, second] = await Promise.all([
      authed(request(app).post(planPath(workspaceId, projectId, `/${artifactId}/approve`)), owner.accessToken),
      authed(request(app).post(planPath(workspaceId, projectId, `/${artifactId}/approve`)), owner.accessToken),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);

    const tasks = await authed(
      request(app).get(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/tasks`),
      owner.accessToken,
    ).expect(200);
    expect(tasks.body).toHaveLength(1);
  });

  it('a simultaneous approve/reject race resolves to exactly one winner (US-048/049)', async () => {
    const { owner, admin, workspaceId, projectId } = await setupProjectWithOwnerAdminMember();
    const artifactId = await createPendingSuggestion(owner, workspaceId, projectId, [{ title: 'Task' }]);

    const [approveRes, rejectRes] = await Promise.all([
      authed(request(app).post(planPath(workspaceId, projectId, `/${artifactId}/approve`)), owner.accessToken),
      authed(request(app).post(planPath(workspaceId, projectId, `/${artifactId}/reject`)), admin.accessToken),
    ]);
    const statuses = [approveRes.status, rejectRes.status].sort();
    expect(statuses).toEqual([200, 409]);

    const artifact = await AIArtifact.findById(artifactId);
    expect(['approved', 'rejected']).toContain(artifact.state);
  });

  it('stale-project revalidation: archiving the project after generation fails approval, no tasks created (FR-056)', async () => {
    const { owner, workspaceId, projectId } = await setupProjectWithOwnerAdminMember();
    const artifactId = await createPendingSuggestion(owner, workspaceId, projectId, [{ title: 'Task' }]);

    await authed(
      request(app).post(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/archive`),
      owner.accessToken,
    ).expect(200);

    await authed(
      request(app).post(planPath(workspaceId, projectId, `/${artifactId}/approve`)),
      owner.accessToken,
    ).expect(422);

    const artifact = await AIArtifact.findById(artifactId);
    expect(artifact.state).toBe('pending_review');
    const tasks = await taskService.listTasks(workspaceId, projectId);
    expect(tasks).toHaveLength(0);
  });

  it('stale-assignee revalidation: a proposed assignee removed before approval fails approval, no tasks created (FR-056)', async () => {
    const { owner, member, workspaceId, projectId } = await setupProjectWithOwnerAdminMember();
    const artifactId = await createPendingSuggestion(owner, workspaceId, projectId, [
      { title: 'Task', assigneeId: member.userId },
    ]);

    await authed(
      request(app).delete(`/api/v1/workspaces/${workspaceId}/members/${member.userId}`),
      owner.accessToken,
    ).expect(204);

    await authed(
      request(app).post(planPath(workspaceId, projectId, `/${artifactId}/approve`)),
      owner.accessToken,
    ).expect(422);

    const artifact = await AIArtifact.findById(artifactId);
    expect(artifact.state).toBe('pending_review');
  });

  it('partial-failure rollback: if task creation fails partway, NO tasks persist and state remains pending_review (FR-052)', async () => {
    const { owner, workspaceId, projectId } = await setupProjectWithOwnerAdminMember();
    const artifactId = await createPendingSuggestion(owner, workspaceId, projectId, [
      { title: 'Task A' },
      { title: 'Task B' },
      { title: 'Task C' },
    ]);

    const insertSpy = vi.spyOn(taskService, 'insertTaskDocument');
    let callCount = 0;
    // Delegates to the real implementation except on the 2nd call, which
    // fails — simulating a failure partway through the batch.
    const actualTaskService = await vi.importActual('../services/taskService.js');
    insertSpy.mockImplementation(async (...args) => {
      callCount += 1;
      if (callCount === 2) {
        throw new Error('simulated failure partway through batch creation');
      }
      return actualTaskService.insertTaskDocument(...args);
    });

    await authed(
      request(app).post(planPath(workspaceId, projectId, `/${artifactId}/approve`)),
      owner.accessToken,
    ).expect(500);

    insertSpy.mockRestore();

    const artifact = await AIArtifact.findById(artifactId);
    expect(artifact.state).toBe('pending_review');
    const tasks = await actualTaskService.listTasks(workspaceId, projectId);
    expect(tasks).toHaveLength(0);
  });

  it('role revoked before the approval request is rejected (role is always re-derived fresh, never cached)', async () => {
    const { owner, member, workspaceId, projectId } = await setupProjectWithOwnerAdminMember();
    const artifactId = await createPendingSuggestion(owner, workspaceId, projectId, [{ title: 'Task' }]);

    // Promote member to admin, get a token reflecting that, then demote again
    // before using the token to approve — the still-valid access token carries
    // no role claim at all (FR-097), so this must be rejected regardless of
    // what the token "remembers."
    await authed(
      request(app).patch(`/api/v1/workspaces/${workspaceId}/members/${member.userId}`),
      owner.accessToken,
    )
      .send({ role: 'admin' })
      .expect(200);
    const promotedLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: member.email, password: 'correct-horse-battery-staple' })
      .expect(200);
    await authed(
      request(app).patch(`/api/v1/workspaces/${workspaceId}/members/${member.userId}`),
      owner.accessToken,
    )
      .send({ role: 'member' })
      .expect(200);

    await authed(
      request(app).post(planPath(workspaceId, projectId, `/${artifactId}/approve`)),
      promotedLogin.body.accessToken,
    ).expect(403);
  });
});

describe('Restricted diagnostic access (FR-125, US-066)', () => {
  it('raw output is never present via the normal API, even for Owner/Admin', async () => {
    const { owner, workspaceId, projectId } = await setupProjectWithOwnerAdminMember();
    callClaude.mockResolvedValue('not valid json');
    await authed(request(app).post(planPath(workspaceId, projectId)), owner.accessToken)
      .send({ goalDescription: 'Goal' })
      .expect(502);

    const artifacts = await AIArtifact.find({ workspaceId, projectId, type: 'plan' });
    const invalidId = artifacts[0]._id.toString();

    const res = await authed(
      request(app).get(planPath(workspaceId, projectId, `/${invalidId}`)),
      owner.accessToken,
    ).expect(200);
    expect(res.body).not.toHaveProperty('rawOutput');
    expect(res.body.validatedOutput).toBeNull();
  });

  it('requires the distinct operator credential, not any workspace-role JWT', async () => {
    process.env.OPERATOR_DIAGNOSTIC_TOKEN = 'test-operator-secret';
    const { owner, workspaceId, projectId } = await setupProjectWithOwnerAdminMember();
    callClaude.mockResolvedValue('not valid json');
    await authed(request(app).post(planPath(workspaceId, projectId)), owner.accessToken)
      .send({ goalDescription: 'Goal' })
      .expect(502);
    const artifacts = await AIArtifact.find({ workspaceId, projectId, type: 'plan' });
    const invalidId = artifacts[0]._id.toString();

    // An Owner's workspace JWT does not work here at all.
    await authed(
      request(app).get(`/internal/diagnostics/artifacts/${invalidId}/raw-output`),
      owner.accessToken,
    ).expect(401);

    // The correct operator token works, and the access is logged.
    const diagRes = await request(app)
      .get(`/internal/diagnostics/artifacts/${invalidId}/raw-output`)
      .set('X-Operator-Token', 'test-operator-secret')
      .set('X-Operator-Id', 'alice-oncall')
      .expect(200);
    expect(diagRes.body.rawOutput).toBe('not valid json');

    const { DiagnosticAccessLog } = await import('../models/DiagnosticAccessLog.js');
    const logs = await DiagnosticAccessLog.find({ artifactId: invalidId });
    expect(logs).toHaveLength(1);
    expect(logs[0].accessedBy).toBe('alice-oncall');

    delete process.env.OPERATOR_DIAGNOSTIC_TOKEN;
  });
});
