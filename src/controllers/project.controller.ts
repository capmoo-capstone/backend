import { Request, Response } from 'express';
import * as projectService from '../service/project.service';

export const getAll = async (req: Request, res: Response) => {
  try {
    const { page, limit } = req.query;
    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 10;
    const data = await projectService.listProjects(pageNum, limitNum);
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

export const getUnassigned = async (req: Request, res: Response) => {
  try {
    const data = await projectService.getUnassignedProjects();
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

export const getById = async (req: Request, res: Response) => {
  const { projectId } = req.params;
  try {
    const project = await projectService.getById(projectId);
    if (project) {
      res.status(200).json(project);
    } else {
      res.status(404).json({ error: 'Project not found' });
    }
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
};

export const createProject = async (req: Request, res: Response) => {
  // #swagger.requestBody = { schema: { $ref: '#/definitions/CreateProjectDto' } }
  try {
    const project = await projectService.createProject(req.body);
    res.status(201).json(project);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
};

export const assignProject = async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const { type, assignee_procurement_id } = req.body;
  try {
    await projectService.getById(projectId);
    if (!assignee_procurement_id) {
      return res
        .status(400)
        .json({ error: 'Assignee procurement ID is required' });
    }
    if (!['procurement', 'contract'].includes(type)) {
      return res.status(400).json({ error: 'Invalid type' });
    }
    const project = await projectService.assignProjectToUser(
      type,
      projectId,
      assignee_procurement_id
    );
    res.status(200).json(project);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
};

export const acceptProject = async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const { type } = req.body;
  try {
    await projectService.getById(projectId);
    if (!['procurement', 'contract'].includes(type)) {
      return res.status(400).json({ error: 'Invalid type' });
    }
    const project = await projectService.acceptProjectAssignment(
      type,
      projectId
    );
    res.status(200).json(project);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
};

export const rejectProject = async (req: Request, res: Response) => {
  const { projectId } = req.params;
  try {
    await projectService.getById(projectId);
    const project = await projectService.rejectProjectAssignment(projectId);
    res.status(200).json(project);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
};
