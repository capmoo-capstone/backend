import { Request, Response } from 'express';
import * as ProjectService from '../service/project.service';

export const getAll = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const { page, limit } = req.query;
  const data = await ProjectService.listProjects(
    parseInt(page as string) || 1,
    parseInt(limit as string) || 10
  );
  res.status(200).json(data);
};

export const getById = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const { projectId } = req.params;
  const project = await ProjectService.getById(projectId);
  res.status(200).json(project);
};

export const getUnassigned = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const { unitId } = req.params;
  const { page, limit } = req.query;
  if (!unitId) {
    return res
      .status(400)
      .json({ status: 'error', message: 'Unit ID is required' });
  }

  const projects = await ProjectService.getUnassignedProjectsByUnit(
    parseInt(page as string) || 1,
    parseInt(limit as string) || 10,
    unitId
  );
  res.status(200).json(projects);
};

export const createProject = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  // #swagger.requestBody = { schema: { $ref: '#/definitions/CreateProjectDto' } }
  const project = await ProjectService.createProject(req.body);
  res.status(201).json(project);
};

export const assignProject = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const { data } = req.body;
  console.log(data);
  const project = await ProjectService.assignProjectsToUser(data);
  res.status(200).json(project);
};

export const acceptProject = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const { projectId } = req.params;
  const { projectType, userId } = req.body;

  const data = { projectType, projectId, userId };
  const project = await ProjectService.acceptProject(data);
  res.status(200).json(project);
};

export const claimProject = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const { projectId } = req.params;
  const { projectType, userId } = req.body;

  const data = { projectType, projectId, userId };
  const project = await ProjectService.claimProject(data);
  res.status(200).json(project);
};

export const cancelProject = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const { projectId } = req.params;
  const project = await ProjectService.cancelProject(projectId);
  res.status(200).json(project);
};

export const updateProject = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  // #swagger.requestBody = { schema: { $ref: '#/definitions/CreateProjectDto' } }
  const { projectId } = req.params;
  const updatedProject = await ProjectService.updateProjectData(
    projectId,
    req.body
  );
  res.status(200).json(updatedProject);
};

export const removeProject = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const { projectId } = req.params;
  await ProjectService.deleteProject(projectId);
  res.status(204).send();
};
