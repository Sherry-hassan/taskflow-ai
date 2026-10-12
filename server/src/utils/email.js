// FR-091's normalization rule: case-folded lowercase, trimmed. Used for User.email
// (FR-001) and Invitation.invitedEmail (FR-091) alike — a single implementation,
// not re-implemented ad hoc at each call site (system-design.md §6).
export function normalizeEmail(email) {
  return email.trim().toLowerCase();
}
