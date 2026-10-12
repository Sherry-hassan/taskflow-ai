import { verifyAccessToken } from '../services/tokenService.js';

// Verifies the Bearer access token on protected routes. M1's own endpoints
// (signup/login/refresh/logout/password-reset) never needed this — they are
// either anonymous or authenticated by the refresh/CSRF cookie pair instead.
// M2 is the first milestone with routes that require "who is the caller"
// before a workspace-role check can even run.
export function requireAuth(req, res, next) {
  const header = req.get('Authorization') || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    const { userId } = verifyAccessToken(token);
    req.auth = { userId };
    return next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired access token' });
  }
}
