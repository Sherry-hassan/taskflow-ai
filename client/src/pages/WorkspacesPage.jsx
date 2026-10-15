import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api/client.js';

export default function WorkspacesPage() {
  const { callWithAuth } = useAuth();
  const [workspaces, setWorkspaces] = useState(null); // null = loading
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await callWithAuth(api.listWorkspaces);
      setWorkspaces(data);
    } catch (err) {
      setError(err.message || 'Failed to load workspaces');
    }
  }, [callWithAuth]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(event) {
    event.preventDefault();
    setError('');
    setCreating(true);
    try {
      await callWithAuth(api.createWorkspace, name);
      setName('');
      await load();
    } catch (err) {
      setError(err.message || 'Failed to create workspace');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Your workspaces</h2>

      <form onSubmit={handleCreate} className="mb-6 flex gap-2">
        <label htmlFor="workspace-name" className="sr-only">
          Workspace name
        </label>
        <input
          id="workspace-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="New workspace name"
          required
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={creating}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Create
        </button>
      </form>

      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}

      {workspaces === null && !error && <p className="text-gray-500">Loading…</p>}
      {workspaces !== null && workspaces.length === 0 && (
        <p className="text-gray-500">No workspaces yet — create one above.</p>
      )}
      <ul className="space-y-2">
        {workspaces?.map((entry) => (
          <li key={entry.workspace.id}>
            <Link
              to={`/workspaces/${entry.workspace.id}`}
              className="block rounded border border-gray-200 bg-white px-4 py-3 hover:border-blue-400"
            >
              <span className="font-medium text-gray-900">{entry.workspace.name}</span>
              <span className="ml-2 text-xs uppercase text-gray-500">{entry.role}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
