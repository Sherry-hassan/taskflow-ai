import { Server } from 'socket.io';
import { verifyAccessToken } from '../services/tokenService.js';
import { Membership } from '../models/Membership.js';
import { Project } from '../models/Project.js';

// FR-040/041: the client authenticates using the same short-lived access
// token used for REST (system-design.md §7), not a separate credential.
export function attachRealtime(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: '*' },
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      const { userId } = verifyAccessToken(token);
      socket.userId = userId;
      return next();
    } catch {
      return next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('join-project', async ({ projectId }, ack) => {
      try {
        // FR-041: "no cross-workspace leakage over the socket connection" — the
        // join is only allowed after the *same* membership check REST routes run
        // (shared Membership model, not a reimplementation), derived from the
        // project's own workspaceId rather than trusting anything the client
        // supplies about which workspace it believes the project belongs to.
        const project = await Project.findById(projectId);
        if (!project) {
          return ack?.({ ok: false, message: 'Not found' });
        }
        const membership = await Membership.findOne({
          workspaceId: project.workspaceId,
          userId: socket.userId,
        });
        if (!membership) {
          return ack?.({ ok: false, message: 'Forbidden' });
        }
        socket.join(`project:${projectId}`);
        return ack?.({ ok: true });
      } catch (err) {
        return ack?.({ ok: false, message: err.message });
      }
    });
  });

  return io;
}
