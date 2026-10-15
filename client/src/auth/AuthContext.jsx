import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../api/client.js';

// FR-007: the access token lives in memory only (React state), never in
// localStorage/sessionStorage. On every page load it's gone — so the first
// thing this provider does is attempt a silent refresh using the existing
// httpOnly refresh cookie (if any), exactly the flow the backend already
// supports, rather than forcing a fresh login on every reload.
const AuthContext = createContext(null);

// api.refresh() only ever returns { accessToken } (no user object) — the
// server has no "/me" endpoint to repopulate `user` after a silent refresh.
// The access token's own `sub` claim (server/src/services/tokenService.js)
// is the same user id login's response carries in `user.id`, and the token
// is already in the client's hands unsigned-but-readable, so decoding it
// locally (no signature check — this is a UX hint, never an authority
// decision; the server independently re-derives identity from the token on
// every request) is enough to keep `userId`-dependent UI (e.g. TaskCard's
// creator/assignee check) correct across a reload, not just right after login.
function decodeAccessTokenUserId(token) {
  if (!token) {
    return null;
  }
  try {
    const payload = token.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json).sub ?? null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const tokenRef = useRef(null);
  tokenRef.current = accessToken;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.refresh();
        if (!cancelled) {
          setAccessToken(res.accessToken);
        }
      } catch {
        // No valid refresh cookie (never logged in, or it expired/was
        // revoked) — not an error condition, just "not authenticated yet".
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await api.login(email, password);
    setAccessToken(res.accessToken);
    setUser(res.user);
    return res;
  }, []);

  const signup = useCallback((email, password) => api.signup(email, password), []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  // Wraps any api.xxx(accessToken, ...args) call. On a 401, attempts exactly
  // one silent refresh + retry before giving up — mirroring the backend's
  // own single-use refresh-token design (a second 401 right after a fresh
  // refresh means the session is genuinely over, not a race to retry again).
  const callWithAuth = useCallback(async (fn, ...args) => {
    try {
      return await fn(tokenRef.current, ...args);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        try {
          const res = await api.refresh();
          setAccessToken(res.accessToken);
          return await fn(res.accessToken, ...args);
        } catch {
          setAccessToken(null);
          setUser(null);
          throw err;
        }
      }
      throw err;
    }
  }, []);

  const userId = useMemo(() => user?.id ?? decodeAccessTokenUserId(accessToken), [user, accessToken]);

  const value = {
    user,
    userId,
    accessToken,
    loading,
    isAuthenticated: Boolean(accessToken),
    login,
    signup,
    logout,
    callWithAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
