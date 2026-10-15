import crypto from 'node:crypto';
import * as authService from '../services/authService.js';

const REFRESH_COOKIE_NAME = 'refreshToken';
const CSRF_COOKIE_NAME = 'csrfToken';
const REFRESH_COOKIE_PATH = '/api/v1/auth';
// Phase 3 fix: a cookie's Path also scopes which *pages* can read it via
// document.cookie, not just which requests carry it. csrfToken is
// non-httpOnly specifically so client JS can read its value and echo it as
// the X-CSRF-Token header (the double-submit pattern, FR-008) — scoped to
// '/api/v1/auth' like refreshToken, no real SPA page (which never lives
// under that path) could ever read it, making the mechanism unusable by any
// actual browser client. Broadening csrfToken's Path to '/' doesn't weaken
// anything: it was already non-secret (non-httpOnly, meant to be read by
// JS), and requireCsrf only ever validates it on /api/v1/auth/refresh and
// /logout regardless of how broadly the browser attaches it. refreshToken
// itself (the actually sensitive, httpOnly cookie) keeps its narrow path.
const CSRF_COOKIE_PATH = '/';
const REFRESH_TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// FR-007 requires the Secure attribute, which is correctly tied to whether the
// connection is actually TLS-terminated — the same standard pattern used by, e.g.,
// express-session: Secure in production (where real TLS is present), relaxed in
// dev/test (where it typically isn't). This is not weakening FR-007's requirement;
// a Secure cookie cannot function at all over plain HTTP regardless of who sets it.
const COOKIES_SECURE = process.env.NODE_ENV === 'production';

// FR-007/NFR-010: refresh token in an httpOnly cookie; FR-008: a separate,
// non-httpOnly CSRF cookie the client must echo back in a header.
function setAuthCookies(res, refreshToken) {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: COOKIES_SECURE,
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_TOKEN_MAX_AGE_MS,
  });
  const csrfToken = crypto.randomBytes(16).toString('hex');
  res.cookie(CSRF_COOKIE_NAME, csrfToken, {
    httpOnly: false,
    secure: COOKIES_SECURE,
    sameSite: 'strict',
    path: CSRF_COOKIE_PATH,
    maxAge: REFRESH_TOKEN_MAX_AGE_MS,
  });
}

function clearAuthCookies(res) {
  res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
  res.clearCookie(CSRF_COOKIE_NAME, { path: CSRF_COOKIE_PATH });
}

export async function signup(req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ message: 'email and password are required' });
  }
  try {
    const user = await authService.signup({ email, password });
    return res.status(201).json(user);
  } catch (err) {
    if (err instanceof authService.EmailAlreadyRegisteredError) {
      return res.status(409).json({ message: 'Email already registered' });
    }
    throw err;
  }
}

export async function login(req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) {
    // US-002: the same generic message regardless of which field was the problem.
    return res.status(401).json({ message: 'Invalid email or password' });
  }
  try {
    const { accessToken, refreshToken, user } = await authService.login({ email, password });
    setAuthCookies(res, refreshToken);
    return res.status(200).json({ accessToken, user });
  } catch (err) {
    if (err instanceof authService.InvalidCredentialsError) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    throw err;
  }
}

export async function refresh(req, res) {
  const rawRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!rawRefreshToken) {
    return res.status(401).json({ message: 'Refresh token missing' });
  }
  try {
    const { accessToken, refreshToken } = await authService.refresh(rawRefreshToken);
    setAuthCookies(res, refreshToken);
    return res.status(200).json({ accessToken });
  } catch {
    clearAuthCookies(res);
    return res.status(401).json({ message: 'Refresh token invalid or expired' });
  }
}

export async function logout(req, res) {
  const rawRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
  if (rawRefreshToken) {
    await authService.logout(rawRefreshToken);
  }
  clearAuthCookies(res);
  return res.status(204).end();
}

export async function requestPasswordReset(req, res) {
  const { email } = req.body || {};
  if (email) {
    await authService.requestPasswordReset(email);
  }
  // FR-009: always the same response, whether or not the email matched an account.
  return res.status(202).end();
}

export async function confirmPasswordReset(req, res) {
  const { token, newPassword } = req.body || {};
  if (!token || !newPassword) {
    return res.status(400).json({ message: 'token and newPassword are required' });
  }
  try {
    await authService.confirmPasswordReset({ token, newPassword });
    return res.status(204).end();
  } catch (err) {
    if (err instanceof authService.InvalidResetTokenError) {
      return res.status(400).json({ message: 'Token expired, already used, or invalid' });
    }
    throw err;
  }
}
