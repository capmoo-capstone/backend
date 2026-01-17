import { Request, Response } from 'express';
import * as projectService from '../service/project.service';

export const getAll = async (req: Request, res: Response) => {
  const { page, limit } = req.query;
  const pageNum = parseInt(page as string) || 1;
  const limitNum = parseInt(limit as string) || 10;
  const data = await projectService.listProjects(pageNum, limitNum);
  res.status(200).json(data);
};

export const getById = async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const project = await projectService.getById(projectId);
  res.status(200).json(project);
};

export const getUnassigned = async (req: Request, res: Response) => {
  const { projectType } = req.query;
  if (!['procurement', 'contract'].includes(projectType as string)) {
    return res.status(400).json({ error: 'Invalid project type' });
  }

  const projects = await projectService.getUnassignedProjects(
    projectType as 'procurement' | 'contract'
  );
  res.status(200).json(projects);
};

export const createProject = async (req: Request, res: Response) => {
  // #swagger.requestBody = { schema: { $ref: '#/definitions/CreateProjectDto' } }
  const receive_no = await projectService.getReceiveNumber();
  req.body.receive_no = receive_no;
  const project = await projectService.createProject(req.body);
  res.status(201).json(project);
};

export const assignProject = async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const { projectType, assigneeId } = req.body;
  if (!assigneeId) {
    return res.status(400).json({ error: 'Assignee ID is required' });
  }
  if (!['procurement', 'contract'].includes(projectType)) {
    return res.status(400).json({ error: 'Invalid type' });
  }
  const project = await projectService.assignProjectToUser(
    projectType as 'procurement' | 'contract',
    projectId,
    assigneeId
  );
  res.status(200).json(project);
};

export const acceptProject = async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const { action, projectType, userId } = req.body;
  if (!['procurement', 'contract'].includes(projectType)) {
    return res.status(400).json({ error: 'Invalid type' });
  }
  if (!['CONFIRM', 'CLAIM'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action' });
  }
  const project = await projectService.acceptProject(
    action as 'CONFIRM' | 'CLAIM',
    projectType as 'procurement' | 'contract',
    projectId,
    userId
  );
  res.status(200).json(project);
};

export const rejectProject = async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const { projectType, userId } = req.body;
  await projectService.getById(projectId);
  const project = await projectService.rejectProject(
    projectType as 'procurement' | 'contract',
    projectId,
    userId
  );
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
