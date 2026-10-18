import { useCallback, useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api/client.js';
import PageHeader from '../components/PageHeader.jsx';
import { FolderIcon, PlusIcon } from '../components/icons.jsx';

export default function WorkspacesPage() {
  const { callWithAuth } = useAuth();
  const openMobileNav = useOutletContext()?.openMobileNav;
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
    <>
      <PageHeader title="Your workspaces" onOpenMenu={openMobileNav} />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-1 text-sm font-semibold text-slate-900">Create a workspace</h2>
          <p className="mb-4 text-sm text-slate-500">Workspaces group your projects, tasks, and teammates.</p>
          <form onSubmit={handleCreate} className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor="workspace-name" className="sr-only">
              Workspace name
            </label>
            <input
              id="workspace-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Product Team"
              required
              className="h-10 flex-1 rounded-lg border border-slate-300 px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
            <button
              type="submit"
              disabled={creating}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <PlusIcon className="h-4 w-4" />
              {creating ? 'Creating…' : 'Create'}
            </button>
          </form>
        </div>

        {error && (
          <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
            {error}
          </p>
        )}

        {workspaces === null && !error && <p className="text-sm text-slate-500">Loading…</p>}
        {workspaces !== null && workspaces.length === 0 && (
          <p className="text-sm text-slate-500">No workspaces yet — create one above.</p>
        )}

        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {workspaces?.map((entry) => (
            <li key={entry.workspace.id}>
              <Link
                to={`/workspaces/${entry.workspace.id}`}
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-shadow hover:border-indigo-300 hover:shadow-md"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                  <FolderIcon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-slate-900">{entry.workspace.name}</span>
                  <span className="text-xs uppercase text-slate-400">{entry.role}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
