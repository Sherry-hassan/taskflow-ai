import { User } from '../models/User.js';
import { PasswordResetToken } from '../models/PasswordResetToken.js';
import { hashPassword, verifyPassword, generateToken, hashToken } from '../utils/crypto.js';
import { sendPasswordResetEmail } from './notifications.js';
import {
  signAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokensForUser,
  REFRESH_REUSE_DETECTED,
} from './tokenService.js';

// FR-091's normalization rule, applied consistently here too (database-design.md §1).
function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

export class EmailAlreadyRegisteredError extends Error {}
export class InvalidCredentialsError extends Error {}
export class InvalidRefreshTokenError extends Error {}
export class RefreshReuseDetectedError extends Error {}
export class InvalidResetTokenError extends Error {}

// FR-009: 1-hour default.
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

export async function signup({ email, password }) {
  const normalized = normalizeEmail(email);
  const existing = await User.findOne({ email: normalized });
  if (existing) {
    throw new EmailAlreadyRegisteredError();
  }
  const passwordHash = await hashPassword(password);
  const user = await User.create({ email: normalized, passwordHash });
  return { id: user._id.toString(), email: user.email };
}

export async function login({ email, password }) {
  const normalized = normalizeEmail(email);
  const user = await User.findOne({ email: normalized });
  if (!user) {
    throw new InvalidCredentialsError();
  }
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    throw new InvalidCredentialsError();
  }
  const accessToken = signAccessToken(user._id);
  const { rawToken: refreshToken } = await issueRefreshToken(user._id);
  return {
    accessToken,
    refreshToken,
    user: { id: user._id.toString(), email: user.email },
  };
}

export async function refresh(rawRefreshToken) {
  try {
    const { rawToken, userId } = await rotateRefreshToken(rawRefreshToken);
    const accessToken = signAccessToken(userId);
    return { accessToken, refreshToken: rawToken };
  } catch (err) {
    if (err.message === REFRESH_REUSE_DETECTED) {
      throw new RefreshReuseDetectedError();
    }
    throw new InvalidRefreshTokenError();
  }
}

export async function logout(rawRefreshToken) {
  await revokeRefreshToken(rawRefreshToken);
}

export async function requestPasswordReset(email) {
  const normalized = normalizeEmail(email);
  const user = await User.findOne({ email: normalized });
  // FR-009: the caller-visible outcome is identical whether or not the account
  // exists — nothing below this point is ever observable by the HTTP response.
  if (!user) {
    return;
  }
  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  await PasswordResetToken.create({
    userId: user._id,
    tokenHash,
    expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
  });
  await sendPasswordResetEmail({ to: user.email, token: rawToken });
}

export async function confirmPasswordReset({ token, newPassword }) {
  const tokenHash = hashToken(token);
  const now = new Date();

  const resetDoc = await PasswordResetToken.findOneAndUpdate(
    { tokenHash, usedAt: null, expiresAt: { $gt: now } },
    { $set: { usedAt: now } },
  );

  if (!resetDoc) {
    throw new InvalidResetTokenError();
  }

  const passwordHash = await hashPassword(newPassword);
  await User.updateOne({ _id: resetDoc.userId }, { $set: { passwordHash } });
  // FR-009: revoke all of the user's existing refresh tokens/sessions. Access
  // tokens are not independently revocable (FR-004) and survive until their own
  // natural expiry — this is the documented tradeoff, not a gap (system-design.md §4).
  await revokeAllRefreshTokensForUser(resetDoc.userId);
}
