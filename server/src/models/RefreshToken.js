import mongoose from 'mongoose';

// FR-005/006/007, NFR-010: opaque, hashed-at-rest refresh tokens. `tokenHash` is a
// deterministic SHA-256 digest (see utils/crypto.js) rather than a bcrypt hash,
// because it must support exact-match lookup by hash — bcrypt's per-call salting
// makes it unsuitable for that; passwords (verified by comparison, never looked up
// by hash) correctly use bcrypt instead (see User.passwordHash).
const refreshTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    familyId: { type: String, required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    replacedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'RefreshToken', default: null },
  },
  { timestamps: true },
);

refreshTokenSchema.index({ userId: 1, revokedAt: 1 });
refreshTokenSchema.index({ familyId: 1 });
// TTL: expired refresh tokens are auto-deleted by MongoDB itself (database-design.md §5)
// — there is no audit requirement over expired refresh tokens, unlike Invitation.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);
