import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword, generateToken, hashToken } from './crypto.js';

describe('hashPassword / verifyPassword (FR-001)', () => {
  it('hashes a password such that the plaintext is never retained in the output', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    expect(hash).not.toBe('correct-horse-battery-staple');
    expect(hash.length).toBeGreaterThan(20);
  });

  it('round-trips: the correct password verifies true, a wrong one verifies false', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    await expect(verifyPassword('correct-horse-battery-staple', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong-password', hash)).resolves.toBe(false);
  });
});

describe('generateToken / hashToken', () => {
  it('generates high-entropy, unique tokens', () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });

  it('hashToken is deterministic (required for exact-match DB lookup)', () => {
    const token = generateToken();
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it('hashToken never returns the raw token itself', () => {
    const token = generateToken();
    expect(hashToken(token)).not.toBe(token);
  });
});
