import { Request, Response } from 'express';
import * as ProjectService from '../service/project.service';
import { open } from 'node:fs';

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
  const { id } = req.params;
  const project = await ProjectService.getById(id);
  res.status(200).json(project);
};

export const getUnassignedByUnit = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const { unitId } = req.params;
  const projects = await ProjectService.getUnassignedProjectsByUnit(unitId);
  res.status(200).json(projects);
};

export const getAssignedProjects = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const { date, userId, unitId } = req.query;
  const targetDate = date ? new Date(date as string) : new Date();
  const projects = await ProjectService.getAssignedProjects(targetDate, {
    userId: userId as string,
    unitId: unitId as string,
  });
  res.status(200).json(projects);
};

export const createProject = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  // #swagger.requestBody = { schema: { $ref: '#/definitions/CreateProjectDto' } }
  const project = await ProjectService.createProject(req.body);
  res.status(201).json(project);
};

export const assignProjects = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const { data } = req.body;
  const project = await ProjectService.assignProjectsToUser(data);
  res.status(200).json(project);
};

export const changeAssignee = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const { id } = req.params;
  const data = { id, userId: req.body.userId };
  const project = await ProjectService.changeAssignee(data);
  res.status(200).json(project);
};

export const acceptProjects = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const { data } = req.body;
  const project = await ProjectService.acceptProjects(data);
  res.status(200).json(project);
};

export const claimProject = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const { id } = req.params;
  const data = { id, userId: req.body.userId };
  const project = await ProjectService.claimProject(data);
  res.status(200).json(project);
};

export const cancelProject = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const { id } = req.params;
  const data = { id, reason: req.body.reason };
  const project = await ProjectService.cancelProject(data);
  res.status(200).json(project);
};

export const updateProject = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  // #swagger.requestBody = { schema: { $ref: '#/definitions/CreateProjectDto' } }
  const { id } = req.params;
  const data = { id, updateData: req.body };
  const updatedProject = await ProjectService.updateProjectData(data);
  res.status(200).json(updatedProject);
};

export const removeProject = async (req: Request, res: Response) => {
  // #swagger.tags = ['Project']
  // #swagger.security = [{ bearerAuth: [] }]
  const { id } = req.params;
  await ProjectService.deleteProject(id);
  res.status(204).send();
};
