// Transactional-email capability (FR-094/FR-095). Real provider integration is
// introduced in M2, which shares this same narrow capability for invitations
// (implementation-plan.md §3/§4). M1 only needs the call site to exist and be
// stable so M2 can swap this implementation without touching any caller.
// eslint-disable-next-line no-unused-vars
export async function sendPasswordResetEmail({ to, token }) {
  // No-op in M1 — no real email provider is wired up yet.
}
