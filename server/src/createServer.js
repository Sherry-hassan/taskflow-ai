import http from 'node:http';
import { createApp } from './app.js';
import { attachRealtime } from './realtime/socketServer.js';
import { setSocketServer } from './realtime/emitter.js';

// Deliberately separate from createApp(): createApp() alone (used by every
// Supertest-based API/integration test) produces a plain Express app with no
// HTTP server and no Socket.IO attached — createServer() is what the real
// process (index.js) and the dedicated realtime test use.
export function createServer() {
  const app = createApp();
  const httpServer = http.createServer(app);
  const io = attachRealtime(httpServer);
  setSocketServer(io);
  return { httpServer, io };
}
