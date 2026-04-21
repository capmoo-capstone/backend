import { Request, Response } from 'express';
import * as AuthService from '../services/auth.service';
import { RegisterUserSchema } from '../schemas/user.schema';
import { AuthPayload } from '../types/auth.type';

export const login = async (req: Request, res: Response) => {
  // #swagger.tags = ['Auth']
  const { username, full_name } = req.body;
  const data = await AuthService.login(username, full_name);
  res.status(200).json(data);
};

export const register = async (req: Request, res: Response) => {
  // #swagger.tags = ['Auth']
  const { username, full_name, role, dept_id, unit_id } = req.body;
  const validatedData = RegisterUserSchema.parse({
    username,
    full_name,
    role,
    dept_id,
    unit_id,
  });
  const data = await AuthService.register(validatedData);
  res.status(201).json(data);
};

export const getMe = async (req: Request, res: Response) => {
  // #swagger.tags = ['Auth']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = (req as any).user as AuthPayload;
  res.status(200).json(payload);
};

export const logout = async (req: Request, res: Response) => {
  // #swagger.tags = ['Auth']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = (req as any).user as AuthPayload;
  await AuthService.logout(payload);
  res.status(200).json({ message: 'Logged out successfully' });
};
