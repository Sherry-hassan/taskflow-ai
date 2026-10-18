import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api/client.js';
import { ChevronDownIcon } from './icons.jsx';

// Workspace switching reuses the exact same listWorkspaces call every other
// page already makes (WorkspacesPage/WorkspacePage/ProjectPage) — this is
// the existing "which workspaces am I a member of" mechanism, not a new one.
// Navigating to a different workspace is a plain route change; membership
// enforcement happens server-side exactly as it does today.
export default function WorkspaceSwitcher({ currentWorkspaceId, currentWorkspaceName }) {
  const { callWithAuth } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState(null);
  const containerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const data = await callWithAuth(api.listWorkspaces);
      setWorkspaces(data);
    } catch {
      setWorkspaces([]);
    }
  }, [callWithAuth]);

  useEffect(() => {
    if (open && workspaces === null) {
      load();
    }
  }, [open, workspaces, load]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function selectWorkspace(workspaceId) {
    setOpen(false);
    navigate(`/workspaces/${workspaceId}`);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Switch workspace"
        className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm font-medium text-slate-700 hover:border-slate-300"
      >
        <span className="truncate" aria-hidden="true">
          {currentWorkspaceName || 'Select a workspace'}
        </span>
        <ChevronDownIcon className="h-4 w-4 shrink-0 text-slate-400" />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute z-10 mt-1.5 w-full rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {workspaces === null && <li className="px-3 py-2 text-sm text-slate-400">Loading…</li>}
          {workspaces?.length === 0 && <li className="px-3 py-2 text-sm text-slate-400">No workspaces yet</li>}
          {workspaces?.map((entry) => (
            <li key={entry.workspace.id}>
              <button
                type="button"
                onClick={() => selectWorkspace(entry.workspace.id)}
                role="option"
                aria-selected={entry.workspace.id === currentWorkspaceId}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                  entry.workspace.id === currentWorkspaceId ? 'text-indigo-600 font-medium' : 'text-slate-700'
                }`}
              >
                <span className="truncate">{entry.workspace.name}</span>
                <span className="text-xs uppercase text-slate-400">{entry.role}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
