// FR-008/NFR-011: double-submit CSRF check, applied only to cookie-authenticated,
// state-changing endpoints (refresh, logout) — per FR-008's own scoping, not to
// anonymous/token-authenticated endpoints like password-reset/confirm (see
// test-strategy.md v0.3's revision note for why that endpoint is excluded).
export function requireCsrf(req, res, next) {
  const cookieToken = req.cookies?.csrfToken;
  const headerToken = req.get('X-CSRF-Token');

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ message: 'CSRF token missing or invalid' });
  }
  return next();
}
