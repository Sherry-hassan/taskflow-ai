import * as projectService from '../services/projectService.js';

export async function createProject(req, res) {
  const { name, description } = req.body || {};
  if (!name) {
    return res.status(400).json({ message: 'name is required' });
  }
  const project = await projectService.createProject(req.auth.workspaceId, req.auth.userId, {
    name,
    description,
  });
  return res.status(201).json(project);
}

export async function listProjects(req, res) {
  const projects = await projectService.listProjects(req.auth.workspaceId);
  return res.status(200).json(projects);
}

export async function getProject(req, res) {
  try {
    const project = await projectService.getProject(req.auth.workspaceId, req.params.projectId);
    return res.status(200).json(project);
  } catch (err) {
    if (err instanceof projectService.ProjectNotFoundError) {
      return res.status(404).json({ message: 'Not found' });
    }
    throw err;
  }
}

export async function updateProject(req, res) {
  const { name, description } = req.body || {};
  try {
    const project = await projectService.updateProject(req.auth.workspaceId, req.params.projectId, {
      name,
      description,
    });
    return res.status(200).json(project);
  } catch (err) {
    if (err instanceof projectService.ProjectNotFoundError) {
      return res.status(404).json({ message: 'Not found' });
    }
    throw err;
  }
}

export async function archiveProject(req, res) {
  try {
    const project = await projectService.archiveProject(req.auth.workspaceId, req.params.projectId);
    return res.status(200).json(project);
  } catch (err) {
    if (err instanceof projectService.ProjectNotFoundError) {
      return res.status(404).json({ message: 'Not found' });
    }
    throw err;
  }
}
