import { Request, Response } from 'express';
import * as ProjectQueryService from '../services/project-query.service';
import * as ProjectAssignmentService from '../services/project-assignment.service';
import * as ProjectDataService from '../services/project-data.service';
import * as ProjectLifecycleService from '../services/project-lifecycle.service';
import {
  AcceptProjectsSchema,
  CancelProjectSchema,
  CreateProjectSchema,
  GetProjectsQueryByUnitSchema,
  ProjectFilterQuerySchema,
  RequestEditProjectSchema,
  UpdateProjectSchema,
  UpdateStatusProjectSchema,
  UpdateStatusProjectsSchema,
} from '../schemas/project.schema';

export const getAll = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const { page, limit } = req.query;
  const { filter } = req.body;
  const payload = (req as any).user;
  const validatedFilter = ProjectFilterQuerySchema.parse(filter);
  const data = await ProjectQueryService.listProjects(
    payload,
    parseInt(page as string) || 1,
    parseInt(limit as string) || 10,
    validatedFilter
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
  const { unitId } = req.query;
  const payload = (req as any).user;
  const validated = GetProjectsQueryByUnitSchema.parse({ unitId });
  const projects = await ProjectQueryService.getUnassignedProjectsByUnit(
    payload,
    validated.unitId
  );
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

export const getWaitingCancellation = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const { unitId } = req.query;
  const payload = (req as any).user;
  const validated = GetProjectsQueryByUnitSchema.parse({ unitId });
  const projects = await ProjectQueryService.getWaitingCancellationProjects(
    payload,
    validated.unitId
  );
  res.status(200).json(projects);
};

export const getOwnProjects = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const { page, limit } = req.query;
  const payload = (req as any).user;
  const projects = await ProjectQueryService.getOwnProjects(
    payload,
    parseInt(page as string) || 1,
    parseInt(limit as string) || 10
  );
  res.status(200).json(projects);
};

export const getWorkload = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = (req as any).user;
  const { unitId } = req.query;
  const workload = await ProjectQueryService.getWorkload(
    payload,
    unitId as string
  );
  res.status(200).json(workload);
};

export const getSummary = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = (req as any).user;
  const summary = await ProjectQueryService.getSummaryCards(payload);
  res.status(200).json(summary);
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

export const importProjects = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  // #swagger.requestBody = { schema: { $ref: '#/definitions/CreateProjectDtoArray' } }
  const payload = (req as any).user;
  const validatedData = CreateProjectSchema.array().parse(req.body);
  const result = await ProjectDataService.importProjects(
    payload,
    validatedData
  );
  res.status(201).json(result);
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
    ...req.body,
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
  const validatedData = UpdateStatusProjectSchema.parse({
    id: projectId,
    ...req.body,
  });
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
  const validatedData = CancelProjectSchema.parse({
    id: projectId,
    ...req.body,
  });
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
  const validatedData = RequestEditProjectSchema.parse({
    id: projectId,
    ...req.body,
  });
  const project = await ProjectLifecycleService.requestEditProject(
    payload,
    validatedData
  );
  res.status(200).json(project);
};

export const updateProject = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  // #swagger.requestBody = { schema: { $ref: '#/definitions/UpdateProjectDto' } }
  const payload = (req as any).user;
  const projectId = req.params.id as string;
  const validatedData = UpdateProjectSchema.parse({
    id: projectId,
    ...req.body,
  });
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
