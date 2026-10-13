import { afterEach, describe, expect, it, vi } from 'vitest';
import { logAppError } from './errorLogging.js';

describe('logAppError (FR-125 extended to general application errors — M7)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs only the allow-listed fields, as an explicit object, never a free-form message', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    logAppError({ name: 'TypeError', method: 'GET', path: '/api/v1/workspaces/x/projects/y', statusCode: 500 });

    expect(spy).toHaveBeenCalledTimes(1);
    const [, payload] = spy.mock.calls[0];
    const parsed = JSON.parse(payload);
    expect(parsed).toMatchObject({ name: 'TypeError', method: 'GET', path: '/api/v1/workspaces/x/projects/y', statusCode: 500 });
    expect(typeof parsed.timestamp).toBe('string');
    expect(Object.keys(parsed).sort()).toEqual(['method', 'name', 'path', 'statusCode', 'timestamp']);
  });

  it('has no parameter for an error message or stack at all — nothing for a caller to accidentally pass through', () => {
    expect(logAppError.length).toBe(1); // a single destructured-options parameter
    expect(logAppError.toString()).not.toMatch(/\.message|\.stack/);
  });
});
