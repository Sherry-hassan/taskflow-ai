import { describe, expect, it } from 'vitest';
import { signAccessToken, verifyAccessToken } from './tokenService.js';

describe('access tokens (FR-004, FR-097)', () => {
  it('round-trips a signed access token back to the same userId', () => {
    const token = signAccessToken('000000000000000000000001');
    const { userId } = verifyAccessToken(token);
    expect(userId).toBe('000000000000000000000001');
  });

  it('never embeds a role or workspace claim (FR-097 — role is always re-derived server-side)', () => {
    const token = signAccessToken('000000000000000000000001');
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    expect(payload).not.toHaveProperty('role');
    expect(payload).not.toHaveProperty('workspaceId');
  });

  it('rejects a tampered token', () => {
    const token = signAccessToken('000000000000000000000001');
    const tampered = `${token.slice(0, -1)}${token.slice(-1) === 'a' ? 'b' : 'a'}`;
    expect(() => verifyAccessToken(tampered)).toThrow();
  });
});
