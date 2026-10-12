import { Project } from '../models/Project.js';

export class ProjectNotFoundError extends Error {}

function toDto(project) {
  return {
    id: project._id.toString(),
    workspaceId: project.workspaceId.toString(),
    name: project.name,
    description: project.description ?? null,
    archived: project.archived,
  };
}

// FR-020: role authority (Owner/Admin only) is enforced by the route's
// requireWorkspaceRole('owner', 'admin') middleware — there is no finer
// per-target nuance here the way there is for member removal/role-change.
export async function createProject(workspaceId, userId, { name, description }) {
  const project = await Project.create({ workspaceId, name, description, createdBy: userId });
  return toDto(project);
}

// FR-021: any workspace member. Archived projects are included.
export async function listProjects(workspaceId) {
  const projects = await Project.find({ workspaceId });
  return projects.map(toDto);
}

export async function getProject(workspaceId, projectId) {
  // Always filters by BOTH the specific id AND the server-derived workspaceId
  // (never projectId alone) — closes the cross-workspace-ID-guessing gap even
  // if a real projectId from another workspace is supplied (NFR-006).
  const project = await Project.findOne({ _id: projectId, workspaceId });
  if (!project) {
    throw new ProjectNotFoundError();
  }
  return toDto(project);
}

export async function updateProject(workspaceId, projectId, { name, description }) {
  const project = await Project.findOne({ _id: projectId, workspaceId });
  if (!project) {
    throw new ProjectNotFoundError();
  }
  if (name !== undefined) project.name = name;
  if (description !== undefined) project.description = description;
  await project.save();
  return toDto(project);
}

// FR-022/123: archiving, not permanent deletion (PRD §4.2 — out of scope for v1).
export async function archiveProject(workspaceId, projectId) {
  const project = await Project.findOne({ _id: projectId, workspaceId });
  if (!project) {
    throw new ProjectNotFoundError();
  }
  project.archived = true;
  await project.save();
  return toDto(project);
}
