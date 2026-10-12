// system-design.md §7: services never emit directly from within a request
// handler's try block before the DB write is confirmed — the emit happens
// after the Mongoose write succeeds, so a failed write can never produce a
// "phantom" realtime update the database doesn't actually reflect.
//
// This module holds the one Socket.IO server instance for the running
// process. Deliberately a no-op when none is attached (e.g. API/Integration
// tests built on createApp() alone, with no HTTP server/Socket.IO attached
// per createServer.js) — unlike M1's rate-limiter bug, this is the *intended*
// behavior here: those tests exercise the REST write path, not the realtime
// path, which has its own dedicated test (realtime.integration.test.js).
let ioInstance = null;

export function setSocketServer(io) {
  ioInstance = io;
}

export function emitToProject(projectId, event, payload) {
  if (!ioInstance) {
    return;
  }
  ioInstance.to(`project:${projectId}`).emit(event, payload);
}
