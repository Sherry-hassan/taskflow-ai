import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import WorkspacesPage from './WorkspacesPage.jsx';
import { api, ApiError } from '../api/client.js';

vi.mock('../api/client.js', async () => {
  const actual = await vi.importActual('../api/client.js');
  return { ...actual, api: { ...actual.api, listWorkspaces: vi.fn(), createWorkspace: vi.fn() } };
});

// A stable function reference, module-level — mirrors the real AuthContext's
// own useCallback(..., [])-wrapped callWithAuth. An inline arrow returned
// fresh on every render would give WorkspacesPage's `useCallback(load,
// [callWithAuth])` a new dependency every render, re-firing its effect far
// more than the real app ever does and desynchronizing this test from actual
// component behavior.
const callWithAuth = (fn, ...args) => fn(null, ...args);
vi.mock('../auth/AuthContext.jsx', () => ({
  useAuth: () => ({ callWithAuth }),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <WorkspacesPage />
    </MemoryRouter>,
  );
}

describe('WorkspacesPage', () => {
  beforeEach(() => {
    api.listWorkspaces.mockReset();
    api.createWorkspace.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading state, then an empty state when there are no workspaces', async () => {
    api.listWorkspaces.mockResolvedValue([]);
    renderPage();

    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(await screen.findByText(/No workspaces yet/)).toBeInTheDocument();
  });

  it('renders each returned workspace with its role', async () => {
    api.listWorkspaces.mockResolvedValue([
      { workspace: { id: 'w1', name: 'Acme' }, role: 'owner' },
    ]);
    renderPage();

    expect(await screen.findByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('owner')).toBeInTheDocument();
  });

  it('shows a generic error message when loading fails', async () => {
    api.listWorkspaces.mockRejectedValue(new ApiError('Request failed', 500));
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Request failed');
  });

  it('creates a workspace and reloads the list', async () => {
    api.listWorkspaces.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { workspace: { id: 'w1', name: 'New One' }, role: 'owner' },
    ]);
    api.createWorkspace.mockResolvedValue({ id: 'w1', name: 'New One' });
    renderPage();

    await screen.findByText(/No workspaces yet/);
    fireEvent.change(screen.getByLabelText('Workspace name'), { target: { value: 'New One' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(api.createWorkspace).toHaveBeenCalledWith(null, 'New One'));
    expect(await screen.findByText('New One')).toBeInTheDocument();
  });
});
