import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { io as ioClient } from 'socket.io-client';
import { createServer } from '../createServer.js';
import { startTestDb, stopTestDb, clearTestDb } from '../test/testDb.js';

let httpServer;
let baseUrl;

beforeAll(async () => {
  await startTestDb();
}, 60000);

beforeEach(async () => {
  ({ httpServer } = createServer());
  await new Promise((resolve) => {
    httpServer.listen(0, '127.0.0.1', resolve);
  });
  const { port } = httpServer.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

afterEach(async () => {
  await clearTestDb();
  await new Promise((resolve) => httpServer.close(resolve));
});

afterAll(async () => {
  await stopTestDb();
});

function uniqueEmail(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

async function signupAndGetToken(email, password = 'correct-horse-battery-staple') {
  await request(baseUrl).post('/api/v1/auth/signup').send({ email, password }).expect(201);
  const res = await request(baseUrl).post('/api/v1/auth/login').send({ email, password }).expect(200);
  return { userId: res.body.user.id, accessToken: res.body.accessToken };
}

function authed(req, accessToken) {
  return req.set('Authorization', `Bearer ${accessToken}`);
}

function connectSocket(accessToken) {
  return ioClient(baseUrl, {
    auth: { token: accessToken },
    transports: ['websocket'],
    forceNew: true,
  });
}

function waitForConnect(socket) {
  return new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
}

function joinProject(socket, projectId) {
  return new Promise((resolve) => {
    socket.emit('join-project', { projectId }, resolve);
  });
}

describe('Real-time task updates (FR-040/041, US-040/041)', () => {
  it('a member who joined the project room receives task:created after a real REST write', async () => {
    const owner = await signupAndGetToken(uniqueEmail('owner'));
    const wsRes = await authed(request(baseUrl).post('/api/v1/workspaces'), owner.accessToken)
      .send({ name: 'Acme' })
      .expect(201);
    const projRes = await authed(
      request(baseUrl).post(`/api/v1/workspaces/${wsRes.body.id}/projects`),
      owner.accessToken,
    )
      .send({ name: 'P1' })
      .expect(201);

    const socket = connectSocket(owner.accessToken);
    await waitForConnect(socket);
    const joinAck = await joinProject(socket, projRes.body.id);
    expect(joinAck.ok).toBe(true);

    const eventPromise = new Promise((resolve) => socket.once('task:created', resolve));

    await authed(
      request(baseUrl).post(`/api/v1/workspaces/${wsRes.body.id}/projects/${projRes.body.id}/tasks`),
      owner.accessToken,
    )
      .send({ title: 'Realtime task' })
      .expect(201);

    const event = await eventPromise;
    expect(event.title).toBe('Realtime task');

    socket.close();
  });

  it('rejects joining a project the socket user is not a member of (FR-041)', async () => {
    const owner = await signupAndGetToken(uniqueEmail('owner'));
    const outsider = await signupAndGetToken(uniqueEmail('outsider'));

    const wsRes = await authed(request(baseUrl).post('/api/v1/workspaces'), owner.accessToken)
      .send({ name: 'Acme' })
      .expect(201);
    const projRes = await authed(
      request(baseUrl).post(`/api/v1/workspaces/${wsRes.body.id}/projects`),
      owner.accessToken,
    )
      .send({ name: 'P1' })
      .expect(201);

    const outsiderSocket = connectSocket(outsider.accessToken);
    await waitForConnect(outsiderSocket);
    const ack = await joinProject(outsiderSocket, projRes.body.id);
    expect(ack.ok).toBe(false);

    // Even though the join was rejected, confirm the outsider's socket never
    // receives an event emitted to that room — not in the room at all.
    let received = false;
    outsiderSocket.on('task:created', () => {
      received = true;
    });

    await authed(
      request(baseUrl).post(`/api/v1/workspaces/${wsRes.body.id}/projects/${projRes.body.id}/tasks`),
      owner.accessToken,
    )
      .send({ title: 'Should not leak' })
      .expect(201);

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(received).toBe(false);

    outsiderSocket.close();
  });

  it('rejects a socket connection with no valid access token', async () => {
    const socket = ioClient(baseUrl, {
      auth: { token: 'not-a-real-token' },
      transports: ['websocket'],
      forceNew: true,
    });
    await expect(waitForConnect(socket)).rejects.toBeTruthy();
    socket.close();
  });
});
