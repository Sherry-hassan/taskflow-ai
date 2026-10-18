import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api/client.js';
import WorkspaceSwitcher from './WorkspaceSwitcher.jsx';
import Avatar from './Avatar.jsx';
import { CloseIcon, FolderIcon, LayoutIcon, LogoutIcon } from './icons.jsx';

function NavLink({ to, icon, children, active }) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      <span className={active ? 'text-indigo-600' : 'text-slate-400'}>{icon}</span>
      <span className="truncate">{children}</span>
    </Link>
  );
}

// The dashboard shell's navigation. Only wires up destinations that actually
// exist as routes today (App.jsx) — no "Analytics"/"Settings" placeholders.
// Workspace name and the current workspace's projects are fetched here with
// the same existing listWorkspaces/listProjects calls every page already
// makes; there is no shared cache layer in this app, so this mirrors that.
export default function Sidebar({ mobileOpen, onClose }) {
  const { user, logout, callWithAuth } = useAuth();
  const { workspaceId, projectId } = useParams();
  const location = useLocation();

  const [workspaceName, setWorkspaceName] = useState('');
  const [projects, setProjects] = useState(null);

  const loadWorkspaceContext = useCallback(async () => {
    if (!workspaceId) {
      setWorkspaceName('');
      setProjects(null);
      return;
    }
    try {
      const [workspaces, projectList] = await Promise.all([
        callWithAuth(api.listWorkspaces),
        callWithAuth(api.listProjects, workspaceId),
      ]);
      const entry = workspaces.find((w) => w.workspace.id === workspaceId);
      setWorkspaceName(entry?.workspace.name ?? '');
      setProjects(projectList);
    } catch {
      setWorkspaceName('');
      setProjects([]);
    }
  }, [callWithAuth, workspaceId]);

  useEffect(() => {
    loadWorkspaceContext();
  }, [loadWorkspaceContext]);

  async function handleLogout() {
    await logout();
  }

  const content = (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center justify-between px-4 pt-5 pb-4">
        <Link to="/" className="text-base font-semibold tracking-tight text-slate-900">
          TaskFlow <span className="text-indigo-600">AI</span>
        </Link>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close navigation"
          className="rounded-md p-1 text-slate-400 hover:bg-slate-100 lg:hidden"
        >
          <CloseIcon className="h-5 w-5" />
        </button>
      </div>

      <div className="px-4 pb-4">
        <WorkspaceSwitcher currentWorkspaceId={workspaceId} currentWorkspaceName={workspaceName} />
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3">
        <NavLink to="/" icon={<LayoutIcon className="h-4.5 w-4.5" />} active={location.pathname === '/'}>
          Workspaces
        </NavLink>

        {workspaceId && (
          <>
            <NavLink
              to={`/workspaces/${workspaceId}`}
              icon={<FolderIcon className="h-4.5 w-4.5" />}
              active={location.pathname === `/workspaces/${workspaceId}`}
            >
              {workspaceName || 'Overview'}
            </NavLink>

            {projects && projects.length > 0 && (
              <div className="pl-3 pt-1">
                <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Projects</p>
                <div className="space-y-0.5">
                  {projects.map((project) => (
                    <NavLink
                      key={project.id}
                      to={`/workspaces/${workspaceId}/projects/${project.id}`}
                      icon={<span className="block h-1.5 w-1.5 rounded-full bg-slate-300" />}
                      active={project.id === projectId}
                    >
                      {project.name}
                    </NavLink>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </nav>

      <div className="border-t border-slate-200 p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
          <Avatar email={user?.email} size="md" />
          <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{user?.email}</span>
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Log out"
            title="Log out"
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <LogoutIcon className="h-4.5 w-4.5" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop: fixed, always visible */}
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 lg:block">{content}</aside>

      {/* Mobile: drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation overlay"
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/40"
          />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-slate-200 shadow-xl">{content}</aside>
        </div>
      )}
    </>
  );
}
