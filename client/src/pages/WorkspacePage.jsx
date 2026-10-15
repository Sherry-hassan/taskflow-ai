import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api/client.js';

export default function WorkspacePage() {
  const { workspaceId } = useParams();
  const { callWithAuth } = useAuth();
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
    <div>
      <p className="mb-1 text-sm text-gray-500">
        <Link to="/" className="hover:underline">
          Workspaces
        </Link>{' '}
        /
      </p>
      <h2 className="mb-6 text-lg font-semibold text-gray-900">{workspaceName || 'Workspace'}</h2>

      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}

      <section className="mb-8">
        <h3 className="mb-2 font-medium text-gray-800">Projects</h3>
        {canManage && (
          <form onSubmit={handleCreateProject} className="mb-4 flex gap-2">
            <label htmlFor="project-name" className="sr-only">
              Project name
            </label>
            <input
              id="project-name"
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              placeholder="New project name"
              required
              className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={creatingProject}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Create
            </button>
          </form>
        )}
        {projects === null && <p className="text-gray-500">Loading…</p>}
        {projects !== null && projects.length === 0 && <p className="text-gray-500">No projects yet.</p>}
        <ul className="space-y-2">
          {projects?.map((project) => (
            <li key={project.id}>
              <Link
                to={`/workspaces/${workspaceId}/projects/${project.id}`}
                className="block rounded border border-gray-200 bg-white px-4 py-3 hover:border-blue-400"
              >
                <span className="font-medium text-gray-900">{project.name}</span>
                {project.archived && <span className="ml-2 text-xs text-gray-400">archived</span>}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="mb-2 font-medium text-gray-800">Members</h3>
        {members === null && <p className="mb-4 text-gray-500">Loading…</p>}
        <ul className="mb-4 space-y-1 text-sm text-gray-700">
          {members?.map((member) => (
            <li key={member.userId}>
              {member.email} <span className="text-xs uppercase text-gray-400">{member.role}</span>
            </li>
          ))}
        </ul>

        {canManage && (
          <form onSubmit={handleInvite} className="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="invite-email" className="block text-xs text-gray-500">
                Email
              </label>
              <input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                required
                className="rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="invite-role" className="block text-xs text-gray-500">
                Role
              </label>
              <select
                id="invite-role"
                value={inviteRole}
                onChange={(event) => setInviteRole(event.target.value)}
                className="rounded border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={inviting}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Invite
            </button>
          </form>
        )}
        {inviteMessage && <p className="mt-2 text-sm text-gray-600">{inviteMessage}</p>}
      </section>
    </div>
  );
}
