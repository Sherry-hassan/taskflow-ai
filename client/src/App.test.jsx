import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App.jsx';

describe('App', () => {
  beforeEach(() => {
    // Simulate "no valid refresh cookie" — the real app's first network call
    // on mount (AuthContext's silent refresh attempt).
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve(JSON.stringify({ message: 'Refresh token missing' })),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('redirects an unauthenticated visitor to the login page', async () => {
    render(<App />);
    const heading = await screen.findByRole('heading', { name: 'Log in' });
    expect(heading).toBeInTheDocument();
  });
});
