// Thin fetch wrapper over the real API (docs/api/openapi.yaml). Every request
// goes through Vite's dev-server proxy (vite.config.js) so the browser sees
// everything as same-origin — credentials: 'include' lets the httpOnly
// refresh cookie and the non-httpOnly CSRF cookie flow exactly as the backend
// already expects (system-design.md §4), with no CORS change on the server.

const API_BASE = '/api/v1';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export function getCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function request(path, { method = 'GET', body, accessToken, csrf = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  if (csrf) {
    const csrfToken = getCookie('csrfToken');
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    // FR-125/CLAUDE.md rule 7's spirit, client-side mirror: never surface
    // anything other than the server's own generic message field.
    throw new ApiError(data?.message || 'Request failed', res.status);
  }
  return data;
}

export const api = {
  signup: (email, password) => request('/auth/signup', { method: 'POST', body: { email, password } }),
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
  refresh: () => request('/auth/refresh', { method: 'POST', csrf: true }),
  logout: () => request('/auth/logout', { method: 'POST', csrf: true }),
  requestPasswordReset: (email) =>
    request('/auth/password-reset/request', { method: 'POST', body: { email } }),
  confirmPasswordReset: (token, newPassword) =>
    request('/auth/password-reset/confirm', { method: 'POST', body: { token, newPassword } }),

  listWorkspaces: (accessToken) => request('/workspaces', { accessToken }),
  createWorkspace: (accessToken, name) =>
    request('/workspaces', { method: 'POST', body: { name }, accessToken }),
  listMembers: (accessToken, workspaceId) =>
    request(`/workspaces/${workspaceId}/members`, { accessToken }),
  createInvitation: (accessToken, workspaceId, email, role) =>
    request(`/workspaces/${workspaceId}/invitations`, {
      method: 'POST',
      body: { email, role },
      accessToken,
    }),
  acceptInvitation: (accessToken, token) =>
    request(`/invitations/${token}/accept`, { method: 'POST', accessToken }),

  listProjects: (accessToken, workspaceId) =>
    request(`/workspaces/${workspaceId}/projects`, { accessToken }),
  getProject: (accessToken, workspaceId, projectId) =>
    request(`/workspaces/${workspaceId}/projects/${projectId}`, { accessToken }),
  createProject: (accessToken, workspaceId, name, description) =>
    request(`/workspaces/${workspaceId}/projects`, {
      method: 'POST',
      body: { name, description },
      accessToken,
    }),

  listTasks: (accessToken, workspaceId, projectId) =>
    request(`/workspaces/${workspaceId}/projects/${projectId}/tasks`, { accessToken }),
  createTask: (accessToken, workspaceId, projectId, payload) =>
    request(`/workspaces/${workspaceId}/projects/${projectId}/tasks`, {
      method: 'POST',
      body: payload,
      accessToken,
    }),
  updateTask: (accessToken, workspaceId, projectId, taskId, payload) =>
    request(`/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}`, {
      method: 'PATCH',
      body: payload,
      accessToken,
    }),
  deleteTask: (accessToken, workspaceId, projectId, taskId) =>
    request(`/workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}`, {
      method: 'DELETE',
      accessToken,
    }),

  requestPlan: (accessToken, workspaceId, projectId, goalDescription) =>
    request(`/workspaces/${workspaceId}/projects/${projectId}/ai/plans`, {
      method: 'POST',
      body: { goalDescription },
      accessToken,
    }),
  listPlans: (accessToken, workspaceId, projectId) =>
    request(`/workspaces/${workspaceId}/projects/${projectId}/ai/plans`, { accessToken }),
  approvePlan: (accessToken, workspaceId, projectId, artifactId) =>
    request(`/workspaces/${workspaceId}/projects/${projectId}/ai/plans/${artifactId}/approve`, {
      method: 'POST',
      accessToken,
    }),
  rejectPlan: (accessToken, workspaceId, projectId, artifactId) =>
    request(`/workspaces/${workspaceId}/projects/${projectId}/ai/plans/${artifactId}/reject`, {
      method: 'POST',
      accessToken,
    }),

  requestRiskAssessment: (accessToken, workspaceId, projectId) =>
    request(`/workspaces/${workspaceId}/projects/${projectId}/ai/risk-assessments`, {
      method: 'POST',
      accessToken,
    }),
  listRiskAssessments: (accessToken, workspaceId, projectId) =>
    request(`/workspaces/${workspaceId}/projects/${projectId}/ai/risk-assessments`, { accessToken }),

  requestSummary: (accessToken, workspaceId, projectId) =>
    request(`/workspaces/${workspaceId}/projects/${projectId}/ai/summaries`, {
      method: 'POST',
      accessToken,
    }),
  listSummaries: (accessToken, workspaceId, projectId) =>
    request(`/workspaces/${workspaceId}/projects/${projectId}/ai/summaries`, { accessToken }),
};
