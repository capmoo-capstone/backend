import e, { Request, Response } from 'express';
import * as projectService from '../service/project.service';
import { da } from 'zod/locales';

export const getAll = async (req: Request, res: Response) => {
  const { page, limit } = req.query;
  const data = await projectService.listProjects(
    parseInt(page as string) || 1,
    parseInt(limit as string) || 10
  );
  res.status(200).json(data);
};

export const getById = async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const project = await projectService.getById(projectId);
  res.status(200).json(project);
};

export const getUnassigned = async (req: Request, res: Response) => {
  const { page, limit, projectType } = req.query;
  if (!['procurement', 'contract'].includes(projectType as string)) {
    return res
      .status(400)
      .json({ status: 'error', message: 'Invalid project type' });
  }

  const projects = await projectService.getUnassignedProjects(
    parseInt(page as string) || 1,
    parseInt(limit as string) || 10,
    projectType as 'procurement' | 'contract'
  );
  res.status(200).json(projects);
};

export const createProject = async (req: Request, res: Response) => {
  // #swagger.requestBody = { schema: { $ref: '#/definitions/CreateProjectDto' } }
  const project = await projectService.createProject(req.body);
  res.status(201).json(project);
};

export const assignProject = async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const { projectType, assigneeId } = req.body;

  const data = { projectType, projectId, userId: assigneeId };
  const project = await projectService.assignProjectToUser(data);
  res.status(200).json(project);
};

export const acceptProject = async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const { projectType, userId } = req.body;

  const data = { projectType, projectId, userId };
  const project = await projectService.acceptProject(data);
  res.status(200).json(project);
};

export const claimProject = async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const { projectType, userId } = req.body;

  const data = { projectType, projectId, userId };
  const project = await projectService.claimProject(data);
  res.status(200).json(project);
};

export const rejectProject = async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const { projectType, userId } = req.body;

  const data = { projectType, projectId, userId };
  const project = await projectService.rejectProject(data);
  res.status(200).json(project);
};

export const updateProject = async (req: Request, res: Response) => {
  // #swagger.requestBody = { schema: { $ref: '#/definitions/CreateProjectDto' } }
  const { projectId } = req.params;
  const updatedProject = await projectService.updateProjectData(
    projectId,
    req.body
  );
  res.status(200).json(updatedProject);
};
