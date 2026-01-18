import { Request, Response } from 'express';
import * as userService from '../service/user.service';

export const signup = async (req: Request, res: Response) => {
  // #swagger.requestBody = { schema: { $ref: '#/definitions/UserSignUp' } }
  const { username, full_name } = req.body;
  if (!username || !full_name) {
    return res
      .status(400)
      .json({ error: 'Username and full name are required' });
  }
  const user = await userService.createUser(req.body);
  res.status(201).json(user);
};

export const getAll = async (req: Request, res: Response) => {
  const { page, limit } = req.query;
  const pageNum = parseInt(page as string) || 1;
  const limitNum = parseInt(limit as string) || 10;
  const data = await userService.listUsers(pageNum, limitNum);
  res.status(200).json(data);
};

export const getById = async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = await userService.getById(id);
  res.status(200).json(user);
};
