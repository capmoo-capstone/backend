import { Request, Response } from 'express';
import * as UserService from '../services/user.service';
import {
  AddRoleSchema,
  RemoveRoleSchema,
  UpdateSupplyRoleSchema,
} from '../schemas/user.schema';

export const getAll = async (req: Request, res: Response) => {
  // #swagger.tags = ['User']
  // #swagger.security = [{ bearerAuth: [] }]
  const { unitId, deptId } = req.query;
  const data = await UserService.listUsers({
    unitId: unitId as string,
    deptId: deptId as string,
  });
  res.status(200).json(data);
};

export const getById = async (req: Request, res: Response) => {
  // #swagger.tags = ['User']
  // #swagger.security = [{ bearerAuth: [] }]
  const id = req.params.id as string;
  const user = await UserService.getById(id);
  res.status(200).json(user);
};

export const updateSupplyRole = async (req: Request, res: Response) => {
  // #swagger.tags = ['User']
  // #swagger.security = [{ bearerAuth: [] }]
  const validatedData = UpdateSupplyRoleSchema.parse(req.body);
  const result = await UserService.updateSupplyRole(validatedData);
  res.status(200).json(result);
};

export const addRole = async (req: Request, res: Response) => {
  // #swagger.tags = ['User']
  // #swagger.security = [{ bearerAuth: [] }]
  const user_id = req.params.id as string;
  const validatedData = AddRoleSchema.parse({ user_id, ...req.body });
  const result = await UserService.addRole(validatedData);
  res.status(201).json(result);
};

export const removeRole = async (req: Request, res: Response) => {
  // #swagger.tags = ['User']
  // #swagger.security = [{ bearerAuth: [] }]
  const user_id = req.params.id as string;
  const validatedData = RemoveRoleSchema.parse({ user_id, ...req.body });
  await UserService.removeRole(validatedData);
  res.status(204).send();
};

export const removeUser = async (req: Request, res: Response) => {
  // #swagger.tags = ['User']
  // #swagger.security = [{ bearerAuth: [] }]
  const id = req.params.id as string;
  await UserService.deleteUser(id);
  res.status(204).send();
};
