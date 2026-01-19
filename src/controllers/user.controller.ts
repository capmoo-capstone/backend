import { Request, Response } from 'express';
import * as UserService from '../service/user.service';

export const getAll = async (req: Request, res: Response) => {
  // #swagger.tags = ['User']
  // #swagger.security = [{ bearerAuth: [] }]
  const { page, limit } = req.query;
  const pageNum = parseInt(page as string) || 1;
  const limitNum = parseInt(limit as string) || 10;
  const data = await UserService.listUsers(pageNum, limitNum);
  res.status(200).json(data);
};

export const getById = async (req: Request, res: Response) => {
  // #swagger.tags = ['User']
  // #swagger.security = [{ bearerAuth: [] }]
  const { id } = req.params;
  const user = await UserService.getById(id);
  res.status(200).json(user);
};

export const updateRole = async (req: Request, res: Response) => {
  // #swagger.tags = ['User']
  // #swagger.security = [{ bearerAuth: [] }]
  const { id } = req.params;
  const { role } = req.body;
  const updatedUser = await UserService.updateRole(id, role);
  res.status(200).json(updatedUser);
};

export const setUserDelegate = async (req: Request, res: Response) => {
  // #swagger.tags = ['User']
  // #swagger.security = [{ bearerAuth: [] }]
  const { id } = req.params;
  const { delegateId } = req.body;
  const updatedUser = await UserService.setUserDelegate(id, delegateId);
  res.status(200).json(updatedUser);
};

export const revokeDelegate = async (req: Request, res: Response) => {
  // #swagger.tags = ['User']
  // #swagger.security = [{ bearerAuth: [] }]
  const { id } = req.params;
  const updatedUser = await UserService.revokeDelegate(id);
  res.status(200).json(updatedUser);
};

export const updateUser = async (req: Request, res: Response) => {
  // #swagger.tags = ['User']
  // #swagger.security = [{ bearerAuth: [] }]
  const { id } = req.params;
  const updatedUser = await UserService.updateUser(id, req.body);
  res.status(200).json(updatedUser);
};

export const removeUser = async (req: Request, res: Response) => {
  // #swagger.tags = ['User']
  // #swagger.security = [{ bearerAuth: [] }]
  const { id } = req.params;
  await UserService.deleteUser(id);
  res.status(204).send();
};
