import { Request, Response } from 'express';
import { toBool, toStringArray } from '../lib/helper';
import {
  CreateDepartmentSchema,
  UpdateDepartmentSchema,
} from '../schemas/department.schema';
import * as DepartmentService from '../services/department.service';
import { AuthenticatedRequest } from '../types/auth.type';

export const getAll = async (req: AuthenticatedRequest, res: Response) => {
  // #swagger.tags = ['Department']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = req.user!;
  const { exclude_dept, excludeDept, withUnit } = req.query;
  const data = await DepartmentService.listDepartments(payload, {
    excludeDeptIds: [
      ...toStringArray(exclude_dept),
      ...toStringArray(excludeDept),
    ],
    withUnit: toBool(withUnit),
  });
  res.status(200).json(data);
};

export const getById = async (req: Request, res: Response) => {
  // #swagger.tags = ['Department']
  // #swagger.security = [{ bearerAuth: [] }]
  const id = req.params.id as string;
  const department = await DepartmentService.getById(id);
  res.status(200).json(department);
};

export const createDepartment = async (req: Request, res: Response) => {
  // #swagger.tags = ['Department']
  // #swagger.security = [{ bearerAuth: [] }]
  // #swagger.requestBody = { schema: { $ref: '#/definitions/CreateDepartmentDto' } }
  const validatedData = CreateDepartmentSchema.parse(req.body);
  const department = await DepartmentService.createDepartment(validatedData);
  res.status(201).json(department);
};

export const updateDepartment = async (req: Request, res: Response) => {
  // #swagger.tags = ['Department']
  // #swagger.security = [{ bearerAuth: [] }]
  // #swagger.requestBody = { schema: { $ref: '#/definitions/UpdateDepartmentDto' } }
  const id = req.params.id as string;
  const validatedData = UpdateDepartmentSchema.parse({ ...req.body, id });
  const updatedDepartment =
    await DepartmentService.updateDepartment(validatedData);
  res.status(200).json(updatedDepartment);
};

export const removeDepartment = async (req: Request, res: Response) => {
  // #swagger.tags = ['Department']
  // #swagger.security = [{ bearerAuth: [] }]
  const id = req.params.id as string;
  await DepartmentService.deleteDepartment(id);
  res.status(204).send();
};
