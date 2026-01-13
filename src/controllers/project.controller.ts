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
