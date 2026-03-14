import { Request, Response } from 'express';
import * as ProjectQueryService from '../services/project-query.service';
import * as ProjectAssignmentService from '../services/project-assignment.service';
import * as ProjectDataService from '../services/project-data.service';
import * as ProjectLifecycleService from '../services/project-lifecycle.service';
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
  const data = await ProjectQueryService.listProjects(
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
  const project = await ProjectQueryService.getById(payload, projectId);
  res.status(200).json(project);
};

export const getUnassignedByUnit = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = (req as any).user;
  const projects =
    await ProjectQueryService.getUnassignedProjectsByUnit(payload);
  res.status(200).json(projects);
};

export const getAssignedProjects = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const { date } = req.query;
  const payload = (req as any).user;
  const targetDate = date ? new Date(date as string) : new Date();
  const projects = await ProjectQueryService.getAssignedProjects(
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
  const project = await ProjectDataService.createProject(
    payload,
    validatedData
  );
  res.status(201).json(project);
};

export const assignProjects = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  // #swagger.requestBody = { schema: { $ref: '#/definitions/AssignProjectsDto' } }
  const payload = (req as any).user;

  const validatedData = UpdateStatusProjectsSchema.parse(req.body);
  const project = await ProjectAssignmentService.assignProjectsToUser(
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
  const project = await ProjectAssignmentService.addAssignee(
    payload,
    validatedData
  );
  res.status(200).json(project);
};

export const returnProject = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = (req as any).user;
  const projectId = req.params.id as string;
  const project = await ProjectAssignmentService.returnProject(
    payload,
    projectId
  );
  res.status(200).json(project);
};

export const changeAssignee = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = (req as any).user;
  const projectId = req.params.id as string;
  const data = { id: projectId, userId: req.body.userId };

  const validatedData = UpdateStatusProjectSchema.parse(data);
  const project = await ProjectAssignmentService.changeAssignee(
    payload,
    validatedData
  );
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
  const project = await ProjectAssignmentService.acceptProjects(
    payload,
    validatedData
  );
  res.status(200).json(project);
};

export const claimProject = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = (req as any).user;
  const projectId = req.params.id as string;
  const project = await ProjectAssignmentService.claimProject(
    payload,
    projectId
  );
  res.status(200).json(project);
};

export const cancelProject = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = (req as any).user;
  const projectId = req.params.id as string;
  const data = { id: projectId, reason: req.body.reason };

  const validatedData = CancelProjectSchema.parse(data);
  const project = await ProjectLifecycleService.cancelProject(
    payload,
    validatedData
  );
  res.status(200).json(project);
};

export const approveCancellation = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = (req as any).user;
  const projectId = req.params.id as string;
  const project = await ProjectLifecycleService.approveCancellation(
    payload,
    projectId
  );
  res.status(200).json(project);
};

export const rejectCancellation = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = (req as any).user;
  const projectId = req.params.id as string;
  const project = await ProjectLifecycleService.rejectCancellation(
    payload,
    projectId
  );
  res.status(200).json(project);
};

export const completeProcurement = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = (req as any).user;
  const projectId = req.params.id as string;
  const project = await ProjectLifecycleService.completeProcurementPhase(
    payload,
    projectId
  );
  res.status(200).json(project);
};

export const closeProject = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = (req as any).user;
  const projectId = req.params.id as string;
  const project = await ProjectLifecycleService.closeProject(
    payload,
    projectId
  );
  res.status(200).json(project);
};

export const requestEditProject = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = (req as any).user;
  const projectId = req.params.id as string;
  const project = await ProjectLifecycleService.requestEditProject(
    payload,
    projectId
  );
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
  const updatedProject = await ProjectDataService.updateProjectData(
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
  await ProjectDataService.deleteProject(payload, projectId);
  res.status(204).send();
};
