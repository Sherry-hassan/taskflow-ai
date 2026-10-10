import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 10;

// FR-001: passwords are hashed; plaintext is never persisted or logged.
export async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

// Cryptographically secure, high-entropy random token (FR-005/FR-009) for refresh
// and password-reset tokens — not a password, so bcrypt's slow salting adds no
// value here; a plain SHA-256 digest is used for the stored, lookup-by-hash value.
export function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}
