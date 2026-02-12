import { Request, Response } from 'express';
import * as AuthService from '../service/auth.service';

export const login = async (req: Request, res: Response) => {
  // #swagger.tags = ['Auth']
  const { username, full_name } = req.body;
  const data = await AuthService.login(username, full_name);
  res.status(200).json(data);
};

export const register = async (req: Request, res: Response) => {
  // #swagger.tags = ['Auth']
  const { username, full_name, role } = req.body;
  if (!username || !full_name) {
    return res
      .status(400)
      .json({ error: 'Username and full name are required' });
  }
  const data = await AuthService.register(username, full_name, role);
  res.status(201).json(data);
};

export const getMe = async (req: Request, res: Response) => {
  // #swagger.tags = ['Auth']
  // #swagger.security = [{ bearerAuth: [] }]
  const { token } = (req as any).user;
  const data = await AuthService.getMe(token);
  res.status(200).json(data);
};
