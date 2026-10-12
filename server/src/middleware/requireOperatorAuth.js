// system-design.md §11: the diagnostic route is NOT reachable with a
// workspace-scoped JWT at all — it requires a distinct operator credential,
// issued out-of-band to engineering/support tooling, structurally disjoint
// from every workspace-role credential in the rest of this app.
export function requireOperatorAuth(req, res, next) {
  const expected = process.env.OPERATOR_DIAGNOSTIC_TOKEN;
  if (!expected) {
    return res.status(503).json({ message: 'Diagnostic access is not configured' });
  }

  const token = req.get('X-Operator-Token');
  if (!token || token !== expected) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  req.operator = { id: req.get('X-Operator-Id') || 'unknown' };
  return next();
}
