import { Request, Response } from 'express';
import * as UserService from '../service/user.service';

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
  const { role } = req.body;
  const updatedUser = await UserService.updateRole(id, role);
  res.status(200).json(updatedUser);
};

export const setUserDelegate = async (req: Request, res: Response) => {
  // #swagger.tags = ['User']
  // #swagger.security = [{ bearerAuth: [] }]
  const id = req.params.id as string;
  const { delegateId } = req.body;
  const updatedUser = await UserService.setUserDelegate(id, delegateId);
  res.status(200).json(updatedUser);
};

export const revokeDelegate = async (req: Request, res: Response) => {
  // #swagger.tags = ['User']
  // #swagger.security = [{ bearerAuth: [] }]
  const id = req.params.id as string;
  const updatedUser = await UserService.revokeDelegate(id);
  res.status(200).json(updatedUser);
};

export const updateUser = async (req: Request, res: Response) => {
  // #swagger.tags = ['User']
  // #swagger.security = [{ bearerAuth: [] }]
  const id = req.params.id as string;
  const updatedUser = await UserService.updateUser(id, req.body);
  res.status(200).json(updatedUser);
};

export const removeUser = async (req: Request, res: Response) => {
  // #swagger.tags = ['User']
  // #swagger.security = [{ bearerAuth: [] }]
  const id = req.params.id as string;
  await UserService.deleteUser(id);
  res.status(204).send();
};
