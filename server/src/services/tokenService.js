import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { RefreshToken } from '../models/RefreshToken.js';
import { generateToken, hashToken } from '../utils/crypto.js';

// FR-004/NFR-014: access token design target.
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
// NFR-014: refresh token design target.
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }
  return secret;
}

// FR-097: no role/workspace claim is ever embedded — every workspace-scoped request
// re-derives the caller's role fresh from the database (system-design.md §5), so a
// stale or tampered token claim can never grant stale/escalated access.
export function signAccessToken(userId) {
  return jwt.sign({ sub: String(userId) }, getJwtSecret(), {
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  });
}

export function verifyAccessToken(rawToken) {
  const payload = jwt.verify(rawToken, getJwtSecret());
  return { userId: payload.sub };
}

export async function issueRefreshToken(userId, familyId = crypto.randomUUID()) {
  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  await RefreshToken.create({ userId, familyId, tokenHash, expiresAt });

  return { rawToken, familyId };
}

export const REFRESH_REUSE_DETECTED = 'REFRESH_REUSE_DETECTED';
export const REFRESH_INVALID = 'REFRESH_INVALID';

/**
 * FR-005: atomic single-use rotation.
 *
 * Known residual limitation (documented, not silently hidden): under a very narrow
 * concurrent-request timing window, if a losing request's family-wide revocation
 * sweep (below) completes before the winning request's brand-new token is inserted,
 * that new token will not be caught by the sweep and could survive. Closing this
 * completely would require a family-level "compromised" marker, which is a
 * database-design.md schema addition outside this milestone's approved scope — not
 * added silently here. The common, deterministic guarantees (exactly one of two
 * concurrent rotation attempts succeeds; replaying an already-rotated token revokes
 * the whole family) are implemented and tested; this edge case is not.
 */
export async function rotateRefreshToken(rawToken) {
  const tokenHash = hashToken(rawToken);
  const now = new Date();

  const existing = await RefreshToken.findOne({ tokenHash });
  if (!existing || existing.expiresAt < now) {
    throw new Error(REFRESH_INVALID);
  }

  // Pre-generate the successor's id so the old doc's `revokedAt` + `replacedBy` are
  // set together, atomically, in the same conditional update (database-design.md §5:
  // "set atomically alongside revokedAt during rotation").
  const newDocId = new mongoose.Types.ObjectId();

  const consumed = await RefreshToken.findOneAndUpdate(
    { _id: existing._id, revokedAt: null },
    { $set: { revokedAt: now, replacedBy: newDocId } },
  );

  if (!consumed) {
    // Reuse of an already-consumed/revoked token — treated as a theft signal,
    // revoking the entire token family (system-design.md §4's documented tradeoff:
    // a duplicate legitimate request is indistinguishable from theft at this layer).
    await RefreshToken.updateMany(
      { familyId: existing.familyId, revokedAt: null },
      { $set: { revokedAt: now } },
    );
    throw new Error(REFRESH_REUSE_DETECTED);
  }

  const newRawToken = generateToken();
  await RefreshToken.create({
    _id: newDocId,
    userId: existing.userId,
    familyId: existing.familyId,
    tokenHash: hashToken(newRawToken),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });

  return { rawToken: newRawToken, userId: existing.userId };
}

export async function revokeRefreshToken(rawToken) {
  const tokenHash = hashToken(rawToken);
  await RefreshToken.updateOne(
    { tokenHash, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}

export async function revokeAllRefreshTokensForUser(userId) {
  await RefreshToken.updateMany(
    { userId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}
