import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { startTestDb, stopTestDb, clearTestDb } from '../test/testDb.js';
import * as notifications from '../services/notifications.js';

let app;

beforeAll(async () => {
  await startTestDb();
}, 60000);

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

async function signupAndGetToken(email, password = 'correct-horse-battery-staple') {
  await request(app).post('/api/v1/auth/signup').send({ email, password }).expect(201);
  const res = await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200);
  return { userId: res.body.user.id, accessToken: res.body.accessToken, email };
}

function authed(req, accessToken) {
  return req.set('Authorization', `Bearer ${accessToken}`);
}

async function createWorkspaceWithOwnerAdminMember() {
  const owner = await signupAndGetToken(uniqueEmail('owner'));
  const wsRes = await authed(request(app).post('/api/v1/workspaces'), owner.accessToken)
    .send({ name: 'Acme' })
    .expect(201);
  const workspaceId = wsRes.body.id;

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

  return { owner, admin, member, workspaceId };
}

describe('Projects (FR-020–022)', () => {
  it('Owner/Admin can create a project; a Member cannot (FR-020)', async () => {
    const { owner, admin, member, workspaceId } = await createWorkspaceWithOwnerAdminMember();

    await authed(request(app).post(`/api/v1/workspaces/${workspaceId}/projects`), owner.accessToken)
      .send({ name: 'By Owner' })
      .expect(201);
    await authed(request(app).post(`/api/v1/workspaces/${workspaceId}/projects`), admin.accessToken)
      .send({ name: 'By Admin' })
      .expect(201);
    await authed(request(app).post(`/api/v1/workspaces/${workspaceId}/projects`), member.accessToken)
      .send({ name: 'By Member' })
      .expect(403);
  });

  it('any workspace member can list projects, including archived ones (FR-021)', async () => {
    const { owner, member, workspaceId } = await createWorkspaceWithOwnerAdminMember();
    const proj = await authed(
      request(app).post(`/api/v1/workspaces/${workspaceId}/projects`),
      owner.accessToken,
    )
      .send({ name: 'P1' })
      .expect(201);
    await authed(
      request(app).post(`/api/v1/workspaces/${workspaceId}/projects/${proj.body.id}/archive`),
      owner.accessToken,
    ).expect(200);

    const list = await authed(
      request(app).get(`/api/v1/workspaces/${workspaceId}/projects`),
      member.accessToken,
    ).expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].archived).toBe(true);
  });

  it('Owner/Admin can update/archive; a Member cannot (FR-022)', async () => {
    const { owner, member, workspaceId } = await createWorkspaceWithOwnerAdminMember();
    const proj = await authed(
      request(app).post(`/api/v1/workspaces/${workspaceId}/projects`),
      owner.accessToken,
    )
      .send({ name: 'P1' })
      .expect(201);

    await authed(
      request(app).patch(`/api/v1/workspaces/${workspaceId}/projects/${proj.body.id}`),
      member.accessToken,
    )
      .send({ name: 'Hacked' })
      .expect(403);
    await authed(
      request(app).patch(`/api/v1/workspaces/${workspaceId}/projects/${proj.body.id}`),
      owner.accessToken,
    )
      .send({ name: 'Renamed' })
      .expect(200);
  });
});

describe('Cross-workspace isolation for projects (FR-013, NFR-006)', () => {
  it('a non-member cannot read a real project by guessing its ID', async () => {
    const wsA = await createWorkspaceWithOwnerAdminMember();
    const wsB = await createWorkspaceWithOwnerAdminMember();

    const projB = await authed(
      request(app).post(`/api/v1/workspaces/${wsB.workspaceId}/projects`),
      wsB.owner.accessToken,
    )
      .send({ name: 'Secret' })
      .expect(201);

    // wsA's owner tries to read wsB's real project by putting wsA's own
    // (legitimate) workspaceId with wsB's real projectId — must still fail,
    // since the project doesn't actually belong to wsA's workspace.
    await authed(
      request(app).get(`/api/v1/workspaces/${wsA.workspaceId}/projects/${projB.body.id}`),
      wsA.owner.accessToken,
    ).expect(404);

    // And directly against wsB's workspaceId, without membership there.
    await authed(
      request(app).get(`/api/v1/workspaces/${wsB.workspaceId}/projects/${projB.body.id}`),
      wsA.owner.accessToken,
    ).expect(403);
  });
});

describe('Tasks (FR-030–034)', () => {
  async function setupProject() {
    const ctx = await createWorkspaceWithOwnerAdminMember();
    const proj = await authed(
      request(app).post(`/api/v1/workspaces/${ctx.workspaceId}/projects`),
      ctx.owner.accessToken,
    )
      .send({ name: 'P1' })
      .expect(201);
    return { ...ctx, projectId: proj.body.id };
  }

  it('any workspace member can create a task (FR-030)', async () => {
    const { member, workspaceId, projectId } = await setupProject();
    const res = await authed(
      request(app).post(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/tasks`),
      member.accessToken,
    )
      .send({ title: 'Do the thing' })
      .expect(201);
    expect(res.body.status).toBe('todo');
    expect(res.body.aiOriginated).toBe(false);
  });

  it('rejects an assignee who is not a member of this workspace (FR-033)', async () => {
    const { owner, workspaceId, projectId } = await setupProject();
    const outsider = await signupAndGetToken(uniqueEmail('outsider'));
    await authed(
      request(app).post(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/tasks`),
      owner.accessToken,
    )
      .send({ title: 'Task', assigneeId: outsider.userId })
      .expect(400);
  });

  it('creator, assignee, and Owner/Admin can update a task; an unrelated Member cannot (FR-031)', async () => {
    const { owner, admin, member, workspaceId, projectId } = await setupProject();
    const other = await signupAndGetToken(uniqueEmail('other'));
    // Invite `other` as a plain member of the same workspace too, so they're a
    // real member but unrelated to this specific task.
    const sendSpy = vi.spyOn(notifications, 'sendInvitationEmail').mockResolvedValue();
    await authed(
      request(app).post(`/api/v1/workspaces/${workspaceId}/invitations`),
      owner.accessToken,
    )
      .send({ email: other.email, role: 'member' })
      .expect(201);
    const token = sendSpy.mock.calls[0][0].token;
    sendSpy.mockRestore();
    await authed(request(app).post(`/api/v1/invitations/${token}/accept`), other.accessToken).expect(200);

    const taskRes = await authed(
      request(app).post(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/tasks`),
      member.accessToken,
    )
      .send({ title: 'Task', assigneeId: admin.userId })
      .expect(201);
    const taskId = taskRes.body.id;

    // Creator (member) can update.
    await authed(
      request(app).patch(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}`),
      member.accessToken,
    )
      .send({ status: 'in_progress' })
      .expect(200);

    // Assignee (admin, also has admin role so this doesn't prove much alone,
    // but still correct) can update.
    await authed(
      request(app).patch(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}`),
      admin.accessToken,
    )
      .send({ status: 'done' })
      .expect(200);

    // Owner can update.
    await authed(
      request(app).patch(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}`),
      owner.accessToken,
    )
      .send({ status: 'todo' })
      .expect(200);

    // An unrelated Member (not creator/assignee/owner/admin) cannot.
    await authed(
      request(app).patch(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}`),
      other.accessToken,
    )
      .send({ status: 'done' })
      .expect(403);
  });

  it('the current assignee (with no other authority) may self-unassign but not reassign to someone else (US-039)', async () => {
    const { owner, member, admin, workspaceId, projectId } = await setupProject();

    const taskRes = await authed(
      request(app).post(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/tasks`),
      owner.accessToken,
    )
      .send({ title: 'Task', assigneeId: member.userId })
      .expect(201);
    const taskId = taskRes.body.id;

    // member is the assignee, not the creator, not owner/admin — may self-unassign.
    await authed(
      request(app).patch(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}`),
      member.accessToken,
    )
      .send({ assigneeId: null })
      .expect(200);

    // Re-assign to member again, then have member try to reassign to admin instead.
    await authed(
      request(app).patch(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}`),
      owner.accessToken,
    )
      .send({ assigneeId: member.userId })
      .expect(200);
    await authed(
      request(app).patch(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}`),
      member.accessToken,
    )
      .send({ assigneeId: admin.userId })
      .expect(403);
  });

  it('creator/Owner/Admin can delete a task; an unrelated Member cannot (FR-031)', async () => {
    const { owner, member, workspaceId, projectId } = await setupProject();
    const other = await signupAndGetToken(uniqueEmail('other'));
    const sendSpy = vi.spyOn(notifications, 'sendInvitationEmail').mockResolvedValue();
    await authed(
      request(app).post(`/api/v1/workspaces/${workspaceId}/invitations`),
      owner.accessToken,
    )
      .send({ email: other.email, role: 'member' })
      .expect(201);
    const token = sendSpy.mock.calls[0][0].token;
    sendSpy.mockRestore();
    await authed(request(app).post(`/api/v1/invitations/${token}/accept`), other.accessToken).expect(200);

    const taskRes = await authed(
      request(app).post(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/tasks`),
      member.accessToken,
    )
      .send({ title: 'Task' })
      .expect(201);

    await authed(
      request(app).delete(
        `/api/v1/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskRes.body.id}`,
      ),
      other.accessToken,
    ).expect(403);
    await authed(
      request(app).delete(
        `/api/v1/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskRes.body.id}`,
      ),
      member.accessToken,
    ).expect(204);
  });

  it('any status transition is allowed, including reopening done → todo (database-design.md §8)', async () => {
    const { owner, workspaceId, projectId } = await setupProject();
    const taskRes = await authed(
      request(app).post(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/tasks`),
      owner.accessToken,
    )
      .send({ title: 'Task' })
      .expect(201);

    await authed(
      request(app).patch(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskRes.body.id}`),
      owner.accessToken,
    )
      .send({ status: 'done' })
      .expect(200);
    const reopened = await authed(
      request(app).patch(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskRes.body.id}`),
      owner.accessToken,
    )
      .send({ status: 'todo' })
      .expect(200);
    expect(reopened.body.status).toBe('todo');
  });

  it('rejects an invalid status value', async () => {
    const { owner, workspaceId, projectId } = await setupProject();
    await authed(
      request(app).post(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/tasks`),
      owner.accessToken,
    )
      .send({ title: 'Task', status: 'not-a-real-status' })
      .expect(400);
  });
});

describe('Task priority, dates, and labels (Jira-style fields, database-design.md §8 revision)', () => {
  async function setupProject() {
    const ctx = await createWorkspaceWithOwnerAdminMember();
    const proj = await authed(
      request(app).post(`/api/v1/workspaces/${ctx.workspaceId}/projects`),
      ctx.owner.accessToken,
    )
      .send({ name: 'P1' })
      .expect(201);
    return { ...ctx, projectId: proj.body.id };
  }

  it('creates a task with priority, start date, due date, and labels', async () => {
    const { owner, workspaceId, projectId } = await setupProject();
    const res = await authed(
      request(app).post(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/tasks`),
      owner.accessToken,
    )
      .send({
        title: 'Ship it',
        priority: 'high',
        startDate: '2026-11-01',
        dueDate: '2026-11-10',
        labels: ['backend', 'urgent'],
      })
      .expect(201);
    expect(res.body.priority).toBe('high');
    expect(res.body.startDate).toBe('2026-11-01T00:00:00.000Z');
    expect(res.body.dueDate).toBe('2026-11-10T00:00:00.000Z');
    expect(res.body.labels).toEqual(['backend', 'urgent']);
  });

  it('creates a task with no optional dates, defaulting priority to medium', async () => {
    const { owner, workspaceId, projectId } = await setupProject();
    const res = await authed(
      request(app).post(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/tasks`),
      owner.accessToken,
    )
      .send({ title: 'No dates' })
      .expect(201);
    expect(res.body.priority).toBe('medium');
    expect(res.body.startDate).toBeNull();
    expect(res.body.dueDate).toBeNull();
    expect(res.body.labels).toEqual([]);
  });

  it.each(['low', 'medium', 'high', 'highest'])('accepts priority value "%s"', async (priority) => {
    const { owner, workspaceId, projectId } = await setupProject();
    const res = await authed(
      request(app).post(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/tasks`),
      owner.accessToken,
    )
      .send({ title: 'Task', priority })
      .expect(201);
    expect(res.body.priority).toBe(priority);
  });

  it('rejects an invalid priority value', async () => {
    const { owner, workspaceId, projectId } = await setupProject();
    await authed(
      request(app).post(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/tasks`),
      owner.accessToken,
    )
      .send({ title: 'Task', priority: 'urgent-ish' })
      .expect(400);
  });

  it('rejects a due date earlier than the start date on create', async () => {
    const { owner, workspaceId, projectId } = await setupProject();
    await authed(
      request(app).post(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/tasks`),
      owner.accessToken,
    )
      .send({ title: 'Task', startDate: '2026-11-10', dueDate: '2026-11-01' })
      .expect(400);
  });

  it('rejects a due date earlier than the start date on update', async () => {
    const { owner, workspaceId, projectId } = await setupProject();
    const taskRes = await authed(
      request(app).post(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/tasks`),
      owner.accessToken,
    )
      .send({ title: 'Task', startDate: '2026-11-01', dueDate: '2026-11-10' })
      .expect(201);

    await authed(
      request(app).patch(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskRes.body.id}`),
      owner.accessToken,
    )
      .send({ dueDate: '2026-10-31' })
      .expect(400);
  });

  it('edit persists priority, dates, and labels', async () => {
    const { owner, workspaceId, projectId } = await setupProject();
    const taskRes = await authed(
      request(app).post(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/tasks`),
      owner.accessToken,
    )
      .send({ title: 'Task' })
      .expect(201);

    const updated = await authed(
      request(app).patch(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskRes.body.id}`),
      owner.accessToken,
    )
      .send({
        priority: 'highest',
        startDate: '2026-11-01',
        dueDate: '2026-11-05',
        labels: ['release'],
      })
      .expect(200);
    expect(updated.body.priority).toBe('highest');
    expect(updated.body.startDate).toBe('2026-11-01T00:00:00.000Z');
    expect(updated.body.dueDate).toBe('2026-11-05T00:00:00.000Z');
    expect(updated.body.labels).toEqual(['release']);

    const list = await authed(
      request(app).get(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/tasks`),
      owner.accessToken,
    ).expect(200);
    const persisted = list.body.find((t) => t.id === taskRes.body.id);
    expect(persisted.priority).toBe('highest');
    expect(persisted.labels).toEqual(['release']);
  });

  it('rejects malformed labels (too many, or too long)', async () => {
    const { owner, workspaceId, projectId } = await setupProject();
    await authed(
      request(app).post(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/tasks`),
      owner.accessToken,
    )
      .send({ title: 'Task', labels: Array.from({ length: 11 }, (_, i) => `label-${i}`) })
      .expect(400);

    await authed(
      request(app).post(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/tasks`),
      owner.accessToken,
    )
      .send({ title: 'Task', labels: ['x'.repeat(31)] })
      .expect(400);
  });

  it('workspace isolation and authorization still apply with the new fields (FR-013, FR-031)', async () => {
    const { workspaceId, projectId } = await setupProject();
    const outsider = await signupAndGetToken(uniqueEmail('outsider'));

    await authed(
      request(app).post(`/api/v1/workspaces/${workspaceId}/projects/${projectId}/tasks`),
      outsider.accessToken,
    )
      .send({ title: 'Task', priority: 'high' })
      .expect(403);
  });
});
