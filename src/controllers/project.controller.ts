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
  const payload = (req as any).user;
  const data = await ProjectService.listProjects(
    payload,
    parseInt(page as string) || 1,
    parseInt(limit as string) || 10
  );
  res.status(200).json(data);
};

export const getById = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const projectId = req.params.id as string;
  const payload = (req as any).user;
  const project = await ProjectService.getById(payload, projectId);
  res.status(200).json(project);
};

export const getUnassignedByUnit = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = (req as any).user;
  const projects = await ProjectService.getUnassignedProjectsByUnit(payload);
  res.status(200).json(projects);
};

export const getAssignedProjects = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const { date } = req.query;
  const payload = (req as any).user;
  const targetDate = date ? new Date(date as string) : new Date();
  const projects = await ProjectService.getAssignedProjects(
    payload,
    targetDate
  );
  res.status(200).json(projects);
};

export const createProject = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  // #swagger.requestBody = { schema: { $ref: '#/definitions/CreateProjectDto' } }
  const payload = (req as any).user;

  const validatedData = CreateProjectSchema.parse(req.body);
  const project = await ProjectService.createProject(payload, validatedData);
  res.status(201).json(project);
};

export const assignProjects = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = (req as any).user;

  const validatedData = UpdateStatusProjectsSchema.parse(req.body);
  const project = await ProjectService.assignProjectsToUser(
    payload,
    validatedData
  );
  res.status(200).json(project);
};

export const addAssignee = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = (req as any).user;
  const projectId = req.params.id as string;
  const validatedData = UpdateStatusProjectSchema.parse({
    id: projectId,
    userId: req.body.userId,
  });
  const project = await ProjectService.addAssignee(payload, validatedData);
  res.status(200).json(project);
};

export const returnProject = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = (req as any).user;
  const projectId = req.params.id as string;
  const project = await ProjectService.returnProject(payload, projectId);
  res.status(200).json(project);
};

export const changeAssignee = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = (req as any).user;
  const projectId = req.params.id as string;
  const data = { id: projectId, userId: req.body.userId };

  const validatedData = UpdateStatusProjectSchema.parse(data);
  const project = await ProjectService.changeAssignee(payload, validatedData);
  res.status(200).json(project);
};

export const acceptProjects = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = (req as any).user;
  const data = req.body;
  const validatedData = AcceptProjectsSchema.parse({
    id: data.map((item: any) => item.id),
  });
  const project = await ProjectService.acceptProjects(payload, validatedData);
  res.status(200).json(project);
};

export const claimProject = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = (req as any).user;
  const projectId = req.params.id as string;
  const project = await ProjectService.claimProject(payload, projectId);
  res.status(200).json(project);
};

export const cancelProject = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = (req as any).user;
  const projectId = req.params.id as string;
  const data = { id: projectId, reason: req.body.reason };

  const validatedData = CancelProjectSchema.parse(data);
  const project = await ProjectService.cancelProject(payload, validatedData);
  res.status(200).json(project);
};

export const approveCancellation = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = (req as any).user;
  const projectId = req.params.id as string;
  const project = await ProjectService.approveCancellation(payload, projectId);
  res.status(200).json(project);
};

export const rejectCancellation = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = (req as any).user;
  const projectId = req.params.id as string;
  const project = await ProjectService.rejectCancellation(payload, projectId);
  res.status(200).json(project);
};

export const updateProject = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  // #swagger.requestBody = { schema: { $ref: '#/definitions/UpdateProjectDto' } }
  const payload = (req as any).user;
  const projectId = req.params.id as string;
  const data = { id: projectId, updateData: req.body };

  const validatedData = UpdateProjectSchema.parse(data);
  const updatedProject = await ProjectService.updateProjectData(
    payload,
    validatedData
  );
  res.status(200).json(updatedProject);
};

export const removeProject = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const projectId = req.params.id as string;
  const payload = (req as any).user;
  await ProjectService.deleteProject(payload, projectId);
  res.status(204).send();
};
