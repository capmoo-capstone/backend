import { Request, Response } from 'express';
import * as UserService from '../services/user.service';
import {
  AddRoleSchema,
  RemoveRoleSchema,
  ListUsersQuerySchema,
  UpdateSupplyRoleSchema,
  CreateUserSchema,
} from '../schemas/user.schema';
import { AuthenticatedRequest } from '../types/auth.type';
import { toBool } from '../lib/helper';

export const getAll = async (req: Request, res: Response) => {
  // #swagger.tags = ['User']
  // #swagger.security = [{ bearerAuth: [] }]
  const { page, limit } = req.query;
  const filter = ListUsersQuerySchema.parse(req.query);
  const data = await UserService.listUsers(
    parseInt(page as string) || 1,
    parseInt(limit as string) || 10,
    filter
  );
  res.status(200).json(data);
};

export const getById = async (req: Request, res: Response) => {
  // #swagger.tags = ['User']
  // #swagger.security = [{ bearerAuth: [] }]
  const id = req.params.id as string;
  const user = await UserService.getById(id);
  res.status(200).json(user);
};

export const createUser = async (req: AuthenticatedRequest, res: Response) => {
  // #swagger.tags = ['User']
  // #swagger.security = [{ bearerAuth: [] }]
  const validatedData = CreateUserSchema.parse(req.body);
  const data = await UserService.createUser(req.user!, validatedData);
  res.status(201).json(data);
};

export const updateUserStatus = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['User']
  // #swagger.security = [{ bearerAuth: [] }]
  const id = req.params.id as string;
  const isActive = toBool(req.query.active);
  const result = await UserService.updateUserStatus(req.user!, id, isActive);
  res.status(200).json(result);
};

export const updateSupplyRole = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['User']
  // #swagger.security = [{ bearerAuth: [] }]
  const validatedData = UpdateSupplyRoleSchema.parse(req.body);
  const result = await UserService.updateSupplyRole(req.user!, validatedData);
  res.status(200).json(result);
};

export const addRole = async (req: AuthenticatedRequest, res: Response) => {
  // #swagger.tags = ['User']
  // #swagger.security = [{ bearerAuth: [] }]
  const user_id = req.params.id ? (req.params.id as string) : req.body.user_id;
  const validatedData = AddRoleSchema.parse({ user_id, ...req.body });
  const result = await UserService.addRole(req.user!, validatedData);
  res.status(201).json(result);
};

export const removeRole = async (req: AuthenticatedRequest, res: Response) => {
  // #swagger.tags = ['User']
  // #swagger.security = [{ bearerAuth: [] }]
  const user_id = req.params.id ? (req.params.id as string) : req.body.user_id;
  const validatedData = RemoveRoleSchema.parse({ user_id, ...req.body });
  await UserService.removeRole(req.user!, validatedData);
  res.status(204).send();
};

export const removeRoleById = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['User']
  // #swagger.security = [{ bearerAuth: [] }]
  const role_id = req.params.role_id as string;
  await UserService.removeRoleById(req.user!, role_id);
  res.status(204).send();
};

export const removeUser = async (req: Request, res: Response) => {
  // #swagger.tags = ['User']
  // #swagger.security = [{ bearerAuth: [] }]
  const id = req.params.id as string;
  await UserService.deleteUser(id);
  res.status(204).send();
};
