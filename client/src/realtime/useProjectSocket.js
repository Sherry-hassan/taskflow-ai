import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

// FR-040/041: authenticates with the same short-lived access token used for
// REST (server/src/realtime/socketServer.js) — not a separate credential.
// Joining a room is NOT automatic on connect: the server only grants it after
// re-deriving the project's workspaceId and checking Membership itself, so
// this hook always sends an explicit `join-project` and waits for its ack.
//
// Rooms are per-socket-connection state server-side — a reconnect gets a new
// socket id, so the room is gone unless rejoined. This hook rejoins on every
// `connect` event (including reconnects), not just once on mount, and tracks
// a `joinedRef` guard so a duplicate `connect` firing before the previous
// join's ack lands can't trigger two overlapping joins.
export function useProjectSocket({
  accessToken,
  projectId,
  onTaskCreated,
  onTaskUpdated,
  onTaskDeleted,
  onReconnected,
}) {
  const [status, setStatus] = useState('connecting');
  const callbacksRef = useRef({ onTaskCreated, onTaskUpdated, onTaskDeleted, onReconnected });
  callbacksRef.current = { onTaskCreated, onTaskUpdated, onTaskDeleted, onReconnected };

  useEffect(() => {
    if (!accessToken || !projectId) {
      return undefined;
    }

    let joining = false;
    // Tracks whether a `connect` is the very first one for this effect
    // instance, vs. a reconnect after a drop. A dropped connection means
    // every event the server would have emitted in the meantime was missed
    // (system-design.md §7's documented v1 recovery behavior: on reconnect,
    // re-fetch current state rather than trying to replay missed events).
    let hasConnectedOnce = false;
    const socket = io('/', {
      path: '/socket.io',
      auth: { token: accessToken },
    });

    function joinRoom() {
      if (joining) {
        return;
      }
      joining = true;
      const isReconnect = hasConnectedOnce;
      hasConnectedOnce = true;
      socket.emit('join-project', { projectId }, (ack) => {
        joining = false;
        setStatus(ack?.ok ? 'joined' : 'forbidden');
        if (ack?.ok && isReconnect) {
          callbacksRef.current.onReconnected?.();
        }
      });
    }

    socket.on('connect', joinRoom);
    socket.on('connect_error', () => setStatus('error'));
    socket.on('disconnect', () => setStatus('connecting'));

    socket.on('task:created', (task) => callbacksRef.current.onTaskCreated?.(task));
    socket.on('task:updated', (task) => callbacksRef.current.onTaskUpdated?.(task));
    socket.on('task:deleted', (payload) => callbacksRef.current.onTaskDeleted?.(payload));

    return () => {
      socket.off('connect', joinRoom);
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [accessToken, projectId]);

  return status;
}
