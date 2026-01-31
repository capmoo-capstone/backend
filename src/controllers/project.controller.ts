import { Request, Response } from 'express';
import * as ProjectService from '../service/project.service';
import {
  AcceptProjectsSchema,
  CancelProjectSchema,
  CreateProjectSchema,
  UpdateProjectSchema,
  UpdateStatusProjectSchema,
  UpdateStatusProjectsSchema,
} from '../models/Project';

export const getAll = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const { page, limit } = req.query;
  const { id, role, unit, dept } = (req as any).user;
  const data = await ProjectService.listProjects(
    { id, role, unit, dept },
    parseInt(page as string) || 1,
    parseInt(limit as string) || 10
  );
  res.status(200).json(data);
};

export const getById = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const { id: projectId } = req.params;
  const { id, role, unit, dept } = (req as any).user;
  const project = await ProjectService.getById(
    { id, role, unit, dept },
    projectId
  );
  res.status(200).json(project);
};

export const getUnassignedByUnit = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const { id, role, unit, dept } = (req as any).user;
  const projects = await ProjectService.getUnassignedProjectsByUnit({
    id,
    role,
    unit,
    dept,
  });
  res.status(200).json(projects);
};

export const getAssignedProjects = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const { date } = req.query;
  const { id, role, unit, dept } = (req as any).user;
  const targetDate = date ? new Date(date as string) : new Date();
  const projects = await ProjectService.getAssignedProjects(
    { id, role, unit, dept },
    targetDate
  );
  res.status(200).json(projects);
};

export const createProject = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  // #swagger.requestBody = { schema: { $ref: '#/definitions/CreateProjectDto' } }
  const { id } = (req as any).user;

  const validatedData = CreateProjectSchema.parse(req.body);
  const project = await ProjectService.createProject({ id }, validatedData);
  res.status(201).json(project);
};

export const assignProjects = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const { id } = (req as any).user;
  const { data } = req.body;

  const validatedData = UpdateStatusProjectsSchema.parse(data);
  const project = await ProjectService.assignProjectsToUser(
    { id },
    validatedData
  );
  res.status(200).json(project);
};

export const changeAssignee = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const { id } = (req as any).user;
  const { id: projectId } = req.params;
  const data = { id: projectId, userId: req.body.userId };

  const validatedData = UpdateStatusProjectSchema.parse(data);
  const project = await ProjectService.changeAssignee({ id }, validatedData);
  res.status(200).json(project);
};

export const acceptProjects = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const { id } = (req as any).user;
  const { data } = req.body;

  const validatedData = AcceptProjectsSchema.parse({
    id: data.map((item: any) => item.id),
    userId: id,
  });
  const project = await ProjectService.acceptProjects({ id }, validatedData);
  res.status(200).json(project);
};

export const claimProject = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const { id } = (req as any).user;
  const { id: projectId } = req.params;
  const project = await ProjectService.claimProject({ id }, projectId);
  res.status(200).json(project);
};

export const cancelProject = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const { id } = (req as any).user;
  const { id: projectId } = req.params;
  const data = { id: projectId, reason: req.body.reason };

  const validatedData = CancelProjectSchema.parse(data);
  const project = await ProjectService.cancelProject({ id }, validatedData);
  res.status(200).json(project);
};

export const updateProject = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  // #swagger.requestBody = { schema: { $ref: '#/definitions/UpdateProjectDto' } }
  const { id } = (req as any).user;
  const { id: projectId } = req.params;
  const data = { id: projectId, updateData: req.body };

  const validatedData = UpdateProjectSchema.parse(data);
  const updatedProject = await ProjectService.updateProjectData(
    { id },
    validatedData
  );
  res.status(200).json(updatedProject);
};

export const removeProject = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const { id: projectId } = req.params;
  const { id, role, unit, dept } = (req as any).user;
  await ProjectService.deleteProject({ id, role, unit, dept }, projectId);
  res.status(204).send();
};
