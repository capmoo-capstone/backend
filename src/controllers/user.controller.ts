import { Request, Response } from 'express';
import * as UserService from '../service/user.service';
import {
  UpdateRoleSchema,
  UpdateRepresentativeUnitSchema,
  UpdateUserUnitSchema,
} from '../models/User';

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

export const updateRole = async (req: Request, res: Response) => {
  // #swagger.tags = ['User']
  // #swagger.security = [{ bearerAuth: [] }]
  const id = req.params.id as string;
  const { role, dept_id, unit_id } = req.body;
  const validatedData = UpdateRoleSchema.parse({ role, dept_id, unit_id });
  const updatedUser = await UserService.updateRole(id, validatedData);
  res.status(200).json(updatedUser);
};

export const addUsersToUnit = async (req: Request, res: Response) => {
  // #swagger.tags = ['User']
  // #swagger.security = [{ bearerAuth: [] }]
  const unitId = req.params.unitId as string;
  const users = req.body.users;

  const validatedData = UpdateUserUnitSchema.parse({
    unit_id: unitId,
    users: users,
  });
  const updatedUser = await UserService.addUsersToSupplyUnit(validatedData);
  res.status(200).json(updatedUser);
};

export const addRepresentativeToUnit = async (req: Request, res: Response) => {
  // #swagger.tags = ['User']
  // #swagger.security = [{ bearerAuth: [] }]
  const id = req.params.id as string;
  const unitId = req.params.unitId as string;

  const validatedData = UpdateRepresentativeUnitSchema.parse({
    id: id,
    unit_id: unitId,
  });
  const updatedUser = await UserService.addRepresentativeToUnit(validatedData);
  res.status(200).json(updatedUser);
};

export const removeUser = async (req: Request, res: Response) => {
  // #swagger.tags = ['User']
  // #swagger.security = [{ bearerAuth: [] }]
  const id = req.params.id as string;
  await UserService.deleteUser(id);
  res.status(204).send();
};
