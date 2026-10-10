import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';

describe('createApp', () => {
  it('is a function that returns an Express app', () => {
    expect(typeof createApp).toBe('function');
    expect(typeof createApp()).toBe('function');
  });
});

describe('GET /health (startup smoke test)', () => {
  it('boots the Express app in-process and responds 200', async () => {
    const app = createApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
