import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Dev-server proxy (Phase 3): the browser only ever talks to this Vite origin.
// /api requests and the /socket.io WebSocket upgrade are forwarded to the real
// Express server, so cookies (refresh token, CSRF) and the Socket.IO handshake
// work as same-origin from the browser's perspective — no CORS middleware is
// added to the server for this, and no production/deployment behavior is
// implied by this config at all (deployment topology is explicitly out of
// scope for this phase).
const API_TARGET = process.env.VITE_API_PROXY_TARGET || 'http://localhost:3001';

const proxyConfig = {
  '/api': { target: API_TARGET, changeOrigin: true },
  '/socket.io': { target: API_TARGET, ws: true },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: proxyConfig },
  preview: { proxy: proxyConfig },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.js'],
  },
});
