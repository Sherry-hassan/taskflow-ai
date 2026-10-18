import { useCallback, useEffect, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api/client.js';
import PageHeader from '../components/PageHeader.jsx';
import Avatar from '../components/Avatar.jsx';
import { FolderIcon, PlusIcon } from '../components/icons.jsx';

export default function WorkspacePage() {
  const { workspaceId } = useParams();
  const { callWithAuth } = useAuth();
  const openMobileNav = useOutletContext()?.openMobileNav;

  const [role, setRole] = useState(null);
  const [workspaceName, setWorkspaceName] = useState('');
  const [projects, setProjects] = useState(null);
  const [members, setMembers] = useState(null);
  const [error, setError] = useState('');
  const [projectName, setProjectName] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [inviting, setInviting] = useState(false);
  const [inviteMessage, setInviteMessage] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [workspaces, projectList, memberList] = await Promise.all([
        callWithAuth(api.listWorkspaces),
        callWithAuth(api.listProjects, workspaceId),
        callWithAuth(api.listMembers, workspaceId),
      ]);
      const entry = workspaces.find((w) => w.workspace.id === workspaceId);
      setRole(entry?.role ?? null);
      setWorkspaceName(entry?.workspace.name ?? '');
      setProjects(projectList);
      setMembers(memberList);
    } catch (err) {
      setError(err.message || 'Failed to load workspace');
    }
  }, [callWithAuth, workspaceId]);

  useEffect(() => {
    load();
  }, [load]);

  // UX-layer hint only, same pattern as TaskCard's own client-side check —
  // the server independently re-derives and re-enforces this on every
  // request (requireWorkspaceRole), regardless of what this component shows.
  const canManage = role === 'owner' || role === 'admin';

  async function handleCreateProject(event) {
    event.preventDefault();
    setError('');
    setCreatingProject(true);
    try {
      await callWithAuth(api.createProject, workspaceId, projectName);
      setProjectName('');
      await load();
    } catch (err) {
      setError(err.message || 'Failed to create project');
    } finally {
      setCreatingProject(false);
    }
  }

  async function handleInvite(event) {
    event.preventDefault();
    setInviteMessage('');
    setInviting(true);
    try {
      await callWithAuth(api.createInvitation, workspaceId, inviteEmail, inviteRole);
      setInviteMessage(`Invitation sent to ${inviteEmail}.`);
      setInviteEmail('');
    } catch (err) {
      setInviteMessage(err.message || 'Failed to invite');
    } finally {
      setInviting(false);
    }
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Workspaces', to: '/' }, { label: workspaceName || 'Workspace' }]}
        title={workspaceName || 'Workspace'}
        onOpenMenu={openMobileNav}
      />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">
        {error && (
          <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
            {error}
          </p>
        )}

        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              Projects {projects !== null && <span className="text-slate-400">({projects.length})</span>}
            </h2>
          </div>

          {canManage && (
            <form onSubmit={handleCreateProject} className="mb-4 flex flex-col gap-2 sm:flex-row">
              <label htmlFor="project-name" className="sr-only">
                Project name
              </label>
              <input
                id="project-name"
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                placeholder="New project name"
                required
                className="h-10 flex-1 rounded-lg border border-slate-300 px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
              <button
                type="submit"
                disabled={creatingProject}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <PlusIcon className="h-4 w-4" />
                {creatingProject ? 'Creating…' : 'Create'}
              </button>
            </form>
          )}

          {projects === null && <p className="text-sm text-slate-500">Loading…</p>}
          {projects !== null && projects.length === 0 && <p className="text-sm text-slate-500">No projects yet.</p>}

          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects?.map((project) => (
              <li key={project.id}>
                <Link
                  to={`/workspaces/${workspaceId}/projects/${project.id}`}
                  className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-shadow hover:border-indigo-300 hover:shadow-md"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                    <FolderIcon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-slate-900">{project.name}</span>
                    {project.archived && <span className="text-xs text-slate-400">Archived</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">
            Members {members !== null && <span className="text-slate-400">({members.length})</span>}
          </h2>

          {members === null && <p className="mb-4 text-sm text-slate-500">Loading…</p>}
          <ul className="mb-5 divide-y divide-slate-100">
            {members?.map((member) => (
              <li key={member.userId} className="flex items-center gap-3 py-2 text-sm">
                <Avatar email={member.email} size="sm" />
                <span className="min-w-0 flex-1 truncate text-slate-700">{member.email}</span>
                <span className="text-xs uppercase text-slate-400">{member.role}</span>
              </li>
            ))}
          </ul>

          {canManage && (
            <form onSubmit={handleInvite} className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
              <div>
                <label htmlFor="invite-email" className="mb-1 block text-xs font-medium text-slate-500">
                  Email
                </label>
                <input
                  id="invite-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  required
                  className="h-9 rounded-lg border border-slate-300 px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
              <div>
                <label htmlFor="invite-role" className="mb-1 block text-xs font-medium text-slate-500">
                  Role
                </label>
                <select
                  id="invite-role"
                  value={inviteRole}
                  onChange={(event) => setInviteRole(event.target.value)}
                  className="h-9 rounded-lg border border-slate-300 px-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={inviting}
                className="inline-flex h-9 items-center justify-center rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {inviting ? 'Inviting…' : 'Invite'}
              </button>
            </form>
          )}
          {inviteMessage && <p className="mt-3 text-sm text-slate-600">{inviteMessage}</p>}
        </section>
      </main>
    </>
  );
}
