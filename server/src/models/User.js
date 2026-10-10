import mongoose from 'mongoose';

// FR-001: email + hashed password only. No `emailVerified` field — email verification
// is explicitly out of v1 scope (database-design.md §1) and would be a speculative,
// unused field until a future PRD revision actually adds that feature.
const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true },
);

export const User = mongoose.model('User', userSchema);
