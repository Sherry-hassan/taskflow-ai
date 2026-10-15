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
  return { userId: res.body.user.id, accessToken: res.body.accessToken };
}

function authed(req, accessToken) {
  return req.set('Authorization', `Bearer ${accessToken}`);
}

describe('POST /workspaces (FR-010)', () => {
  it('creates a workspace and the creator becomes its Owner', async () => {
    const { accessToken } = await signupAndGetToken(uniqueEmail('create'));
    const res = await authed(request(app).post('/api/v1/workspaces'), accessToken)
      .send({ name: 'Acme' })
      .expect(201);
    expect(res.body.name).toBe('Acme');

    const list = await authed(request(app).get('/api/v1/workspaces'), accessToken).expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].role).toBe('owner');
  });

  it('rejects an unauthenticated request (no Bearer token)', async () => {
    await request(app).post('/api/v1/workspaces').send({ name: 'Acme' }).expect(401);
  });
});

describe('Invitation accept, with email normalization and token lifecycle (FR-090–093)', () => {
  async function createWorkspaceAsOwner() {
    const owner = await signupAndGetToken(uniqueEmail('owner'));
    const wsRes = await authed(request(app).post('/api/v1/workspaces'), owner.accessToken)
      .send({ name: 'Acme' })
      .expect(201);
    return { owner, workspaceId: wsRes.body.id };
  }

  async function inviteAndCaptureToken(workspaceId, inviterToken, email, role) {
    const sendSpy = vi.spyOn(notifications, 'sendInvitationEmail').mockResolvedValue();
    await authed(request(app).post(`/api/v1/workspaces/${workspaceId}/invitations`), inviterToken)
      .send({ email, role })
      .expect(201);
    expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({ to: email.trim().toLowerCase() }));
    const { token } = sendSpy.mock.calls[0][0];
    sendSpy.mockRestore();
    return token;
  }

  it('Owner invites an Admin; Admin attempting to invite at admin level is rejected (FR-090)', async () => {
    const { owner, workspaceId } = await createWorkspaceAsOwner();
    const adminEmail = uniqueEmail('admin');
    const token = await inviteAndCaptureToken(workspaceId, owner.accessToken, adminEmail, 'admin');

    const admin = await signupAndGetToken(adminEmail);
    const accepted = await authed(
      request(app).post(`/api/v1/invitations/${token}/accept`),
      admin.accessToken,
    ).expect(200);
    expect(accepted.body.role).toBe('admin');

    // Now the Admin tries to invite someone else at the admin level — rejected.
    const anotherEmail = uniqueEmail('another');
    await authed(
      request(app).post(`/api/v1/workspaces/${workspaceId}/invitations`),
      admin.accessToken,
    )
      .send({ email: anotherEmail, role: 'admin' })
      .expect(403);

    // But the same Admin CAN invite at the member level.
    await authed(
      request(app).post(`/api/v1/workspaces/${workspaceId}/invitations`),
      admin.accessToken,
    )
      .send({ email: anotherEmail, role: 'member' })
      .expect(201);
  });

  it('accepts regardless of letter case/whitespace, rejects a non-matching email (US-013)', async () => {
    const { owner, workspaceId } = await createWorkspaceAsOwner();
    const invitedEmail = 'Jane.Doe@Example.com';
    const token = await inviteAndCaptureToken(workspaceId, owner.accessToken, invitedEmail, 'member');

    // Sign up with a differently-cased/whitespaced version of the same email.
    const password = 'correct-horse-battery-staple';
    await request(app)
      .post('/api/v1/auth/signup')
      .send({ email: ' jane.doe@example.com ', password })
      .expect(201);
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'jane.doe@example.com', password })
      .expect(200);

    const accepted = await authed(
      request(app).post(`/api/v1/invitations/${token}/accept`),
      loginRes.body.accessToken,
    ).expect(200);
    expect(accepted.body.role).toBe('member');
  });

  it('rejects acceptance by a different, non-matching account (US-013)', async () => {
    const { owner, workspaceId } = await createWorkspaceAsOwner();
    const invitedEmail = uniqueEmail('invited');
    const token = await inviteAndCaptureToken(workspaceId, owner.accessToken, invitedEmail, 'member');

    const stranger = await signupAndGetToken(uniqueEmail('stranger'));
    await authed(
      request(app).post(`/api/v1/invitations/${token}/accept`),
      stranger.accessToken,
    ).expect(400);
  });

  it('rejects an already-accepted (reused) invitation token (FR-092)', async () => {
    const { owner, workspaceId } = await createWorkspaceAsOwner();
    const invitedEmail = uniqueEmail('reuse');
    const token = await inviteAndCaptureToken(workspaceId, owner.accessToken, invitedEmail, 'member');

    const invited = await signupAndGetToken(invitedEmail);
    await authed(
      request(app).post(`/api/v1/invitations/${token}/accept`),
      invited.accessToken,
    ).expect(200);

    // Same token, replayed.
    await authed(
      request(app).post(`/api/v1/invitations/${token}/accept`),
      invited.accessToken,
    ).expect(400);
  });

  it('a revoked invitation cannot be accepted (FR-092/093)', async () => {
    const { owner, workspaceId } = await createWorkspaceAsOwner();
    const invitedEmail = uniqueEmail('revoked');
    const sendSpy = vi.spyOn(notifications, 'sendInvitationEmail').mockResolvedValue();
    const createRes = await authed(
      request(app).post(`/api/v1/workspaces/${workspaceId}/invitations`),
      owner.accessToken,
    )
      .send({ email: invitedEmail, role: 'member' })
      .expect(201);
    const token = sendSpy.mock.calls[0][0].token;
    sendSpy.mockRestore();

    await authed(
      request(app).delete(`/api/v1/workspaces/${workspaceId}/invitations/${createRes.body.id}`),
      owner.accessToken,
    ).expect(204);

    const invited = await signupAndGetToken(invitedEmail);
    await authed(
      request(app).post(`/api/v1/invitations/${token}/accept`),
      invited.accessToken,
    ).expect(400);
  });
});

describe('Invitation revocation authority (FR-093, US-017)', () => {
  it('Owner may revoke any pending invitation (admin- or member-level)', async () => {
    const owner = await signupAndGetToken(uniqueEmail('owner'));
    const wsRes = await authed(request(app).post('/api/v1/workspaces'), owner.accessToken)
      .send({ name: 'Acme' })
      .expect(201);
    const workspaceId = wsRes.body.id;

    const adminInviteRes = await authed(
      request(app).post(`/api/v1/workspaces/${workspaceId}/invitations`),
      owner.accessToken,
    )
      .send({ email: uniqueEmail('a'), role: 'admin' })
      .expect(201);

    await authed(
      request(app).delete(
        `/api/v1/workspaces/${workspaceId}/invitations/${adminInviteRes.body.id}`,
      ),
      owner.accessToken,
    ).expect(204);
  });

  it('Admin may revoke a Member-level invitation issued by a DIFFERENT Admin, but not an Admin-level one', async () => {
    const owner = await signupAndGetToken(uniqueEmail('owner'));
    const adminAEmail = uniqueEmail('adminA');
    const adminBEmail = uniqueEmail('adminB');

    const wsRes = await authed(request(app).post('/api/v1/workspaces'), owner.accessToken)
      .send({ name: 'Acme' })
      .expect(201);
    const workspaceId = wsRes.body.id;

    async function inviteAndAccept(email, role) {
      const sendSpy = vi.spyOn(notifications, 'sendInvitationEmail').mockResolvedValue();
      await authed(
        request(app).post(`/api/v1/workspaces/${workspaceId}/invitations`),
        owner.accessToken,
      )
        .send({ email, role })
        .expect(201);
      const token = sendSpy.mock.calls[0][0].token;
      sendSpy.mockRestore();
      const acceptor = await signupAndGetToken(email);
      await authed(
        request(app).post(`/api/v1/invitations/${token}/accept`),
        acceptor.accessToken,
      ).expect(200);
      return acceptor;
    }

    await inviteAndAccept(adminAEmail, 'admin');
    await inviteAndAccept(adminBEmail, 'admin');

    // adminB (a different Admin) issues a Member-level invite. Re-login to get a
    // fresh access token reflecting their (now admin) membership.
    const memberEmail = uniqueEmail('member');
    const sendSpy = vi.spyOn(notifications, 'sendInvitationEmail').mockResolvedValue();
    const adminBLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: adminBEmail, password: 'correct-horse-battery-staple' })
      .expect(200);
    const memberInviteRes = await authed(
      request(app).post(`/api/v1/workspaces/${workspaceId}/invitations`),
      adminBLogin.body.accessToken,
    )
      .send({ email: memberEmail, role: 'member' })
      .expect(201);
    sendSpy.mockRestore();

    // adminA (a DIFFERENT Admin) revokes it — succeeds, scope is level-based.
    const adminALogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: adminAEmail, password: 'correct-horse-battery-staple' })
      .expect(200);
    await authed(
      request(app).delete(
        `/api/v1/workspaces/${workspaceId}/invitations/${memberInviteRes.body.id}`,
      ),
      adminALogin.body.accessToken,
    ).expect(204);

    // Now an Admin-level invite exists — adminA cannot revoke it.
    const sendSpy2 = vi.spyOn(notifications, 'sendInvitationEmail').mockResolvedValue();
    const adminLevelInviteRes = await authed(
      request(app).post(`/api/v1/workspaces/${workspaceId}/invitations`),
      owner.accessToken,
    )
      .send({ email: uniqueEmail('yetanother'), role: 'admin' })
      .expect(201);
    sendSpy2.mockRestore();

    await authed(
      request(app).delete(
        `/api/v1/workspaces/${workspaceId}/invitations/${adminLevelInviteRes.body.id}`,
      ),
      adminALogin.body.accessToken,
    ).expect(403);
  });
});

describe('Role change and removal authority (FR-012/096/097, US-025–029)', () => {
  async function setup() {
    const owner = await signupAndGetToken(uniqueEmail('owner'));
    const wsRes = await authed(request(app).post('/api/v1/workspaces'), owner.accessToken)
      .send({ name: 'Acme' })
      .expect(201);
    const workspaceId = wsRes.body.id;

    async function inviteAndAccept(email, role) {
      const sendSpy = vi.spyOn(notifications, 'sendInvitationEmail').mockResolvedValue();
      await authed(
        request(app).post(`/api/v1/workspaces/${workspaceId}/invitations`),
        owner.accessToken,
      )
        .send({ email, role })
        .expect(201);
      const token = sendSpy.mock.calls[0][0].token;
      sendSpy.mockRestore();
      const acceptor = await signupAndGetToken(email);
      await authed(
        request(app).post(`/api/v1/invitations/${token}/accept`),
        acceptor.accessToken,
      ).expect(200);
      return acceptor;
    }

    const adminEmail = uniqueEmail('admin');
    const memberEmail = uniqueEmail('member');
    const admin = await inviteAndAccept(adminEmail, 'admin');
    const member = await inviteAndAccept(memberEmail, 'member');

    return { owner, admin, member, workspaceId };
  }

  it('Only the Owner may promote/demote (FR-096); an Admin attempting it is rejected', async () => {
    const { owner, admin, member, workspaceId } = await setup();

    await authed(
      request(app).patch(`/api/v1/workspaces/${workspaceId}/members/${member.userId}`),
      owner.accessToken,
    )
      .send({ role: 'admin' })
      .expect(200);

    await authed(
      request(app).patch(`/api/v1/workspaces/${workspaceId}/members/${member.userId}`),
      admin.accessToken,
    )
      .send({ role: 'member' })
      .expect(403);
  });

  it('Owner can remove an Admin outright; Admin cannot remove another Admin or the Owner (FR-012)', async () => {
    const { owner, admin, workspaceId } = await setup();

    const secondAdminEmail = uniqueEmail('admin2');
    const sendSpy = vi.spyOn(notifications, 'sendInvitationEmail').mockResolvedValue();
    await authed(
      request(app).post(`/api/v1/workspaces/${workspaceId}/invitations`),
      owner.accessToken,
    )
      .send({ email: secondAdminEmail, role: 'admin' })
      .expect(201);
    const token = sendSpy.mock.calls[0][0].token;
    sendSpy.mockRestore();
    const secondAdmin = await signupAndGetToken(secondAdminEmail);
    await authed(
      request(app).post(`/api/v1/invitations/${token}/accept`),
      secondAdmin.accessToken,
    ).expect(200);

    // Admin cannot remove another Admin.
    await authed(
      request(app).delete(`/api/v1/workspaces/${workspaceId}/members/${secondAdmin.userId}`),
      admin.accessToken,
    ).expect(403);

    // Admin cannot remove the Owner.
    await authed(
      request(app).delete(`/api/v1/workspaces/${workspaceId}/members/${owner.userId}`),
      admin.accessToken,
    ).expect(403);

    // Owner CAN remove an Admin outright.
    await authed(
      request(app).delete(`/api/v1/workspaces/${workspaceId}/members/${secondAdmin.userId}`),
      owner.accessToken,
    ).expect(204);
  });

  it('Admin can remove a Member', async () => {
    const { admin, member, workspaceId } = await setup();
    await authed(
      request(app).delete(`/api/v1/workspaces/${workspaceId}/members/${member.userId}`),
      admin.accessToken,
    ).expect(204);
  });

  it('a Member attempting any membership action is rejected', async () => {
    const { member, workspaceId } = await setup();
    await authed(
      request(app).post(`/api/v1/workspaces/${workspaceId}/invitations`),
      member.accessToken,
    )
      .send({ email: uniqueEmail('x'), role: 'member' })
      .expect(403);
  });
});

describe('Ownership transfer (FR-098/099, US-027/028)', () => {
  async function setup() {
    const owner = await signupAndGetToken(uniqueEmail('owner'));
    const wsRes = await authed(request(app).post('/api/v1/workspaces'), owner.accessToken)
      .send({ name: 'Acme' })
      .expect(201);
    const workspaceId = wsRes.body.id;

    const memberEmail = uniqueEmail('member');
    const sendSpy = vi.spyOn(notifications, 'sendInvitationEmail').mockResolvedValue();
    await authed(
      request(app).post(`/api/v1/workspaces/${workspaceId}/invitations`),
      owner.accessToken,
    )
      .send({ email: memberEmail, role: 'member' })
      .expect(201);
    const token = sendSpy.mock.calls[0][0].token;
    sendSpy.mockRestore();
    const member = await signupAndGetToken(memberEmail);
    await authed(
      request(app).post(`/api/v1/invitations/${token}/accept`),
      member.accessToken,
    ).expect(200);

    return { owner, member, workspaceId };
  }

  it('transfers ownership to an existing member; exactly one Owner before and after', async () => {
    const { owner, member, workspaceId } = await setup();

    const res = await authed(
      request(app).post(`/api/v1/workspaces/${workspaceId}/transfer-ownership`),
      owner.accessToken,
    )
      .send({ toUserId: member.userId })
      .expect(200);

    const roles = res.body.map((m) => m.role).sort();
    expect(roles).toEqual(['admin', 'owner']);

    const members = await authed(
      request(app).get(`/api/v1/workspaces/${workspaceId}/members`),
      member.accessToken,
    ).expect(200);
    const owners = members.body.filter((m) => m.role === 'owner');
    expect(owners).toHaveLength(1);
    expect(owners[0].userId).toBe(member.userId);
  });

  it('rejects a non-Owner attempting to initiate a transfer (FR-098)', async () => {
    const { member, workspaceId } = await setup();
    const other = await signupAndGetToken(uniqueEmail('other'));
    await authed(
      request(app).post(`/api/v1/workspaces/${workspaceId}/transfer-ownership`),
      member.accessToken,
    )
      .send({ toUserId: other.userId })
      .expect(403);
  });

  it('rejects a target who is not an existing member of this workspace (FR-098)', async () => {
    const { owner, workspaceId } = await setup();
    const outsider = await signupAndGetToken(uniqueEmail('outsider'));
    await authed(
      request(app).post(`/api/v1/workspaces/${workspaceId}/transfer-ownership`),
      owner.accessToken,
    )
      .send({ toUserId: outsider.userId })
      .expect(400);
  });

  it('the Owner can never be removed via the member-removal endpoint (FR-099 last-Owner safeguard)', async () => {
    const { owner, member, workspaceId } = await setup();
    // Promote member to admin first so they have removal authority to attempt with.
    await authed(
      request(app).patch(`/api/v1/workspaces/${workspaceId}/members/${member.userId}`),
      owner.accessToken,
    )
      .send({ role: 'admin' })
      .expect(200);

    await authed(
      request(app).delete(`/api/v1/workspaces/${workspaceId}/members/${owner.userId}`),
      member.accessToken,
    ).expect(403);
  });
});

describe('Cross-workspace isolation (FR-013, NFR-006, US-019)', () => {
  it('a user with no membership in Workspace B cannot read its members or invitations', async () => {
    const ownerA = await signupAndGetToken(uniqueEmail('ownerA'));
    const ownerB = await signupAndGetToken(uniqueEmail('ownerB'));

    const wsA = await authed(request(app).post('/api/v1/workspaces'), ownerA.accessToken)
      .send({ name: 'A' })
      .expect(201);
    const wsB = await authed(request(app).post('/api/v1/workspaces'), ownerB.accessToken)
      .send({ name: 'B' })
      .expect(201);

    // ownerA (not a member of B) tries to read B's members/invitations by
    // guessing B's real, valid workspaceId.
    await authed(
      request(app).get(`/api/v1/workspaces/${wsB.body.id}/members`),
      ownerA.accessToken,
    ).expect(403);
    await authed(
      request(app).get(`/api/v1/workspaces/${wsB.body.id}/invitations`),
      ownerA.accessToken,
    ).expect(403);
    await authed(
      request(app).post(`/api/v1/workspaces/${wsB.body.id}/invitations`),
      ownerA.accessToken,
    )
      .send({ email: uniqueEmail('x'), role: 'member' })
      .expect(403);

    // Sanity: ownerA CAN read their own workspace A's members.
    await authed(
      request(app).get(`/api/v1/workspaces/${wsA.body.id}/members`),
      ownerA.accessToken,
    ).expect(200);
  });
});

describe('GET /workspaces/:workspaceId/members — email field (Phase 3 addition)', () => {
  it("includes each member's email alongside userId/workspaceId/role", async () => {
    const ownerEmail = uniqueEmail('owner-email-check');
    const owner = await signupAndGetToken(ownerEmail);
    const wsRes = await authed(request(app).post('/api/v1/workspaces'), owner.accessToken)
      .send({ name: 'Acme' })
      .expect(201);

    const res = await authed(
      request(app).get(`/api/v1/workspaces/${wsRes.body.id}/members`),
      owner.accessToken,
    ).expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      userId: owner.userId,
      workspaceId: wsRes.body.id,
      role: 'owner',
      email: ownerEmail,
    });
  });
});
