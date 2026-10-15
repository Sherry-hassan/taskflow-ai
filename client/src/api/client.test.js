import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, getCookie } from './client.js';

// jsdom's `document.cookie` setter, like a real browser's, only ever sets or
// updates ONE cookie per assignment — it never clears the jar. Each name
// must be individually expired, or state leaks between tests.
function clearCookies() {
  document.cookie.split(';').forEach((pair) => {
    const name = pair.split('=')[0].trim();
    if (name) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    }
  });
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body === undefined ? '' : JSON.stringify(body)),
  };
}

describe('api client', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
    clearCookies();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends an Authorization header when an access token is provided', async () => {
    global.fetch.mockResolvedValue(jsonResponse(200, []));
    await api.listWorkspaces('a-token');

    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers.Authorization).toBe('Bearer a-token');
    expect(options.credentials).toBe('include');
  });

  it('throws an ApiError with the server-provided message and status on failure', async () => {
    global.fetch.mockResolvedValue(jsonResponse(403, { message: 'Forbidden' }));

    const err = await api.listWorkspaces('a-token').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe('Forbidden');
    expect(err.status).toBe(403);
  });

  it('falls back to a generic message when the server response has no message field', async () => {
    global.fetch.mockResolvedValue(jsonResponse(500, undefined));

    const err = await api.listWorkspaces('a-token').catch((e) => e);
    expect(err.message).toBe('Request failed');
  });

  it('attaches the CSRF header, read from the csrfToken cookie, on refresh/logout only', async () => {
    document.cookie = 'csrfToken=abc123';
    global.fetch.mockResolvedValue(jsonResponse(200, { accessToken: 'x' }));

    await api.refresh();
    const [, refreshOptions] = global.fetch.mock.calls[0];
    expect(refreshOptions.headers['X-CSRF-Token']).toBe('abc123');

    global.fetch.mockClear();
    global.fetch.mockResolvedValue(jsonResponse(200, []));
    await api.listWorkspaces('a-token');
    const [, listOptions] = global.fetch.mock.calls[0];
    expect(listOptions.headers['X-CSRF-Token']).toBeUndefined();
  });

  it('getCookie returns null when the named cookie is absent', () => {
    document.cookie = 'other=value';
    expect(getCookie('csrfToken')).toBeNull();
  });
});
