import { Response } from 'express';
import * as ProjectQueryService from '../services/project-query.service';
import * as ProjectAssignmentService from '../services/project-assignment.service';
import * as ProjectDataService from '../services/project-data.service';
import * as ProjectLifecycleService from '../services/project-lifecycle.service';
import { AuthenticatedRequest } from '../types/auth.type';
import {
  AcceptProjectsSchema,
  CancelContractNumberSchema,
  CancelProjectSchema,
  CreateProjectSchema,
  GetNewContractNumberSchema,
  GetProjectsQueryByUnitSchema,
  ProjectFilterQuerySchema,
  RequestEditProjectSchema,
  UpdateProjectSchema,
  UpdateStatusProjectSchema,
  UpdateStatusProjectsSchema,
} from '../schemas/project.schema';

export const getAll = async (req: AuthenticatedRequest, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const { page, limit } = req.query;
  const { filter } = req.body;
  const payload = req.user!;
  const validatedFilter = ProjectFilterQuerySchema.parse(filter);
  const data = await ProjectQueryService.listProjects(
    payload,
    parseInt(page as string) || 1,
    parseInt(limit as string) || 10,
    validatedFilter
  );
  res.status(200).json(data);
};

export const getById = async (req: AuthenticatedRequest, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const projectId = req.params.id as string;
  const payload = req.user!;
  const project = await ProjectQueryService.getById(payload, projectId);
  res.status(200).json(project);
};

export const getUnassignedByUnit = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const { unitId } = req.query;
  const payload = req.user!;
  const validated = GetProjectsQueryByUnitSchema.parse({ unitId });
  const projects = await ProjectQueryService.getUnassignedProjectsByUnit(
    payload,
    validated.unitId
  );
  res.status(200).json(projects);
};

export const getAssignedProjects = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const { date } = req.query;
  const payload = req.user!;
  const targetDate = date ? new Date(date as string) : new Date();
  const projects = await ProjectQueryService.getAssignedProjects(
    payload,
    targetDate
  );
  res.status(200).json(projects);
};

export const getWaitingCancellation = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const { unitId } = req.query;
  const payload = req.user!;
  const validated = GetProjectsQueryByUnitSchema.parse({ unitId });
  const projects = await ProjectQueryService.getWaitingCancellationProjects(
    payload,
    validated.unitId
  );
  res.status(200).json(projects);
};

export const getOwnProjects = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const { page, limit } = req.query;
  const payload = req.user!;
  const projects = await ProjectQueryService.getOwnProjects(
    payload,
    parseInt(page as string) || 1,
    parseInt(limit as string) || 10
  );
  res.status(200).json(projects);
};

export const getWorkload = async (req: AuthenticatedRequest, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = req.user!;
  const { unitId } = req.query;
  const workload = await ProjectQueryService.getWorkload(
    payload,
    unitId as string
  );
  res.status(200).json(workload);
};

export const getSummary = async (req: AuthenticatedRequest, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = req.user!;
  const summary = await ProjectQueryService.getSummaryCards(payload);
  res.status(200).json(summary);
};

export const createProject = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  // #swagger.requestBody = { schema: { $ref: '#/definitions/CreateProjectDto' } }
  const payload = req.user!;

  const validatedData = CreateProjectSchema.parse(req.body);
  const project = await ProjectDataService.createProject(
    payload,
    validatedData
  );
  res.status(201).json(project);
};

export const importProjects = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  // #swagger.requestBody = { schema: { $ref: '#/definitions/CreateProjectDtoArray' } }
  const payload = req.user!;
  const validatedData = CreateProjectSchema.array().parse(req.body);
  const result = await ProjectDataService.importProjects(
    payload,
    validatedData
  );
  res.status(201).json(result);
};

export const assignProjects = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  // #swagger.requestBody = { schema: { $ref: '#/definitions/AssignProjectsDto' } }
  const payload = req.user!;

  const validatedData = UpdateStatusProjectsSchema.parse(req.body);
  const project = await ProjectAssignmentService.assignProjectsToUser(
    payload,
    validatedData
  );
  res.status(200).json(project);
};

export const addAssignee = async (req: AuthenticatedRequest, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = req.user!;
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

export const returnProject = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = req.user!;
  const projectId = req.params.id as string;
  const project = await ProjectAssignmentService.returnProject(
    payload,
    projectId
  );
  res.status(200).json(project);
};

export const changeAssignee = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = req.user!;
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

export const acceptProjects = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = req.user!;
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

export const claimProject = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = req.user!;
  const projectId = req.params.id as string;
  const project = await ProjectAssignmentService.claimProject(
    payload,
    projectId
  );
  res.status(200).json(project);
};

export const cancelProject = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = req.user!;
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

export const approveCancellation = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = req.user!;
  const projectId = req.params.id as string;
  const project = await ProjectLifecycleService.approveCancellation(
    payload,
    projectId
  );
  res.status(200).json(project);
};

export const rejectCancellation = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = req.user!;
  const projectId = req.params.id as string;
  const project = await ProjectLifecycleService.rejectCancellation(
    payload,
    projectId
  );
  res.status(200).json(project);
};

export const completeProcurement = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = req.user!;
  const projectId = req.params.id as string;
  const project = await ProjectLifecycleService.completeProcurementPhase(
    payload,
    projectId
  );
  res.status(200).json(project);
};

export const completeContract = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = req.user!;
  const projectId = req.params.id as string;
  const project = await ProjectLifecycleService.completeContractPhase(
    payload,
    projectId
  );
  res.status(200).json(project);
};

export const closeProject = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = req.user!;
  const projectId = req.params.id as string;
  const project = await ProjectLifecycleService.closeProject(
    payload,
    projectId
  );
  res.status(200).json(project);
};

export const requestEditProject = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  // #swagger.requestBody = { schema: { $ref: '#/definitions/RequestEditProjectDto' } }
  const payload = req.user!;
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

export const getNewContractNumber = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  // #swagger.requestBody = { schema: { $ref: '#/definitions/GetNewContractNumberDto' } }
  const { type, budget_year } = GetNewContractNumberSchema.parse(req.body);
  const result = await ProjectDataService.generateContractNumber(
    type,
    budget_year
  );
  res.status(200).json(result);
};

export const cancelContractNumber = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  // #swagger.requestBody = { schema: { $ref: '#/definitions/CancelContractNumberDto' } }
  const payload = req.user!;
  const { contractId, reason } = CancelContractNumberSchema.parse({
    contractId: req.params.contractId,
    ...req.body,
  });
  const result = await ProjectDataService.cancelContractNumber(
    payload,
    contractId,
    reason
  );
  res.status(200).json(result);
};

export const updateProject = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  // #swagger.requestBody = { schema: { $ref: '#/definitions/UpdateProjectDto' } }
  const payload = req.user!;
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

export const removeProject = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const projectId = req.params.id as string;
  const payload = req.user!;
  await ProjectDataService.deleteProject(payload, projectId);
  res.status(204).send();
};
