import { Request, Response } from 'express';
import * as AuthService from '../services/auth.service';
import { RegisterUserSchema } from '../schemas/user.schema';
import { AuthenticatedRequest } from '../types/auth.type';

export const login = async (req: Request, res: Response) => {
  // #swagger.tags = ['Auth']
  const { username, password } = req.body;
  const data = await AuthService.login(username, password);
  res.status(200).json(data);
};

export const register = async (req: Request, res: Response) => {
  // #swagger.tags = ['Auth']
  const { username, password, full_name, role, dept_id, unit_id } = req.body;
  const validatedData = RegisterUserSchema.parse({
    username,
    password,
    full_name,
    role,
    dept_id,
    unit_id,
  });
  const data = await AuthService.register(validatedData);
  res.status(201).json(data);
};

export const getMe = async (req: AuthenticatedRequest, res: Response) => {
  // #swagger.tags = ['Auth']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = req.user!;
  res.status(200).json(payload);
};

export const logout = async (req: AuthenticatedRequest, res: Response) => {
  // #swagger.tags = ['Auth']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = req.user!;
  await AuthService.logout(payload);
  res.status(200).json({ message: 'Logged out successfully' });
};
