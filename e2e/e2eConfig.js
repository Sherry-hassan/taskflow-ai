// Shared, fixed ports for the whole E2E run — deliberately distinct from the
// documented local-dev defaults (server 3001, client 5173), so this harness
// never collides with an already-running local dev server.
export const API_PORT = 3101;
export const CLIENT_PORT = 5273;
