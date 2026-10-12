import { Membership } from '../models/Membership.js';

// system-design.md §5: a single middleware that, on every workspace-scoped
// route, loads the caller's Membership fresh from MongoDB — never from the
// JWT, never from a cache that could outlive a role change. This is what
// makes FR-097's anti-escalation rule structural rather than a convention:
// there is no client-supplied role field anywhere for a controller to trust.
//
// Call with no roles (requireWorkspaceRole()) to require membership only,
// any role; call with specific roles (requireWorkspaceRole('owner')) to
// additionally require one of them.
export function requireWorkspaceRole(...allowedRoles) {
  return async function middleware(req, res, next) {
    const { workspaceId } = req.params;
    try {
      const membership = await Membership.findOne({ workspaceId, userId: req.auth.userId });

      if (!membership) {
        // Enforces FR-013/NFR-006 workspace isolation: no membership here means
        // this caller gets exactly the same response as a non-member would for
        // any workspace, including one that doesn't exist or belongs to someone
        // else entirely — closing the "guessable ID across workspaces" gap.
        return res.status(403).json({ message: 'Forbidden' });
      }
      if (allowedRoles.length > 0 && !allowedRoles.includes(membership.role)) {
        return res.status(403).json({ message: 'Forbidden' });
      }

      req.auth.workspaceId = workspaceId;
      req.auth.role = membership.role;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}
