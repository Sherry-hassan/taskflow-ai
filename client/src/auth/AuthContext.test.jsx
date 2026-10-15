import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext.jsx';
import { api, ApiError } from '../api/client.js';

vi.mock('../api/client.js', async () => {
  const actual = await vi.importActual('../api/client.js');
  return {
    ...actual,
    api: {
      ...actual.api,
      refresh: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
    },
  };
});

function Probe({ onReady }) {
  const auth = useAuth();
  onReady(auth);
  return (
    <div>
      <p data-testid="status">{auth.loading ? 'loading' : auth.isAuthenticated ? 'authed' : 'anon'}</p>
    </div>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    api.refresh.mockReset();
    api.login.mockReset();
    api.logout.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('attempts a silent refresh on mount and ends up unauthenticated when there is no valid refresh cookie', async () => {
    api.refresh.mockRejectedValue(new ApiError('Refresh token missing', 401));
    render(
      <AuthProvider>
        <Probe onReady={() => {}} />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anon'));
    expect(api.refresh).toHaveBeenCalledTimes(1);
  });

  it('becomes authenticated when the silent refresh succeeds', async () => {
    api.refresh.mockResolvedValue({ accessToken: 'fresh-token' });
    render(
      <AuthProvider>
        <Probe onReady={() => {}} />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authed'));
  });

  it('callWithAuth retries exactly once via a fresh refresh after a 401, then succeeds', async () => {
    api.refresh
      .mockRejectedValueOnce(new ApiError('Refresh token missing', 401)) // boot-time silent refresh fails
      .mockResolvedValueOnce({ accessToken: 'retried-token' }); // callWithAuth's own refresh

    let authRef;
    render(
      <AuthProvider>
        <Probe onReady={(auth) => (authRef = auth)} />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anon'));

    const flaky = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('Invalid or expired access token', 401))
      .mockResolvedValueOnce('ok');

    const result = await authRef.callWithAuth(flaky, 'arg1');

    expect(result).toBe('ok');
    expect(flaky).toHaveBeenNthCalledWith(1, null, 'arg1');
    expect(flaky).toHaveBeenNthCalledWith(2, 'retried-token', 'arg1');
  });

  // Phase 3 regression: api.refresh() only ever returns { accessToken }, with
  // no `user` object — so a reload must still recover `userId` (decoded from
  // the token's own `sub` claim) for userId-dependent UI like TaskCard's
  // creator/assignee check, even though `user.email` genuinely stays
  // unavailable until the next real login (no "/me" endpoint exists).
  it('recovers userId from the access token after a silent refresh, with no user object', async () => {
    const tokenForUser42 =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMDAwMDAwMDAwMDAwMDAwMDAwMDAwNDIifQ.sig';
    api.refresh.mockResolvedValue({ accessToken: tokenForUser42 });

    let authRef;
    render(
      <AuthProvider>
        <Probe onReady={(auth) => (authRef = auth)} />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authed'));

    expect(authRef.userId).toBe('000000000000000000000042');
    expect(authRef.user).toBeNull();
  });

  it('logout clears the in-memory session even if the server call fails', async () => {
    api.refresh.mockRejectedValue(new ApiError('Refresh token missing', 401));
    api.login.mockResolvedValue({ accessToken: 'tok', user: { id: 'u1', email: 'a@example.com' } });
    api.logout.mockRejectedValue(new Error('network error'));

    let authRef;
    render(
      <AuthProvider>
        <Probe onReady={(auth) => (authRef = auth)} />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anon'));

    await authRef.login('a@example.com', 'pw');
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authed'));

    await expect(authRef.logout()).rejects.toThrow('network error');
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anon'));
  });
});
