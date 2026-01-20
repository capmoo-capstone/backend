import { Request, Response } from 'express';
import * as DepartmentService from '../service/department.service';

export const getAll = async (req: Request, res: Response) => {
  // #swagger.tags = ['Department']
  // #swagger.security = [{ bearerAuth: [] }]
  const { page, limit } = req.query;
  const data = await DepartmentService.listDepartments(
    parseInt(page as string) || 1,
    parseInt(limit as string) || 10
  );
  res.status(200).json(data);
};

export const getById = async (req: Request, res: Response) => {
  // #swagger.tags = ['Department']
  // #swagger.security = [{ bearerAuth: [] }]
  const { departmentId } = req.params;
  const department = await DepartmentService.getById(departmentId);
  res.status(200).json(department);
};

export const createDepartment = async (req: Request, res: Response) => {
  // #swagger.tags = ['Department']
  // #swagger.security = [{ bearerAuth: [] }]
  // #swagger.requestBody = { schema: { $ref: '#/definitions/CreateDepartmentDto' } }
  const { data } = req.body;
  const department = await DepartmentService.createDepartment(data);
  res.status(201).json(department);
};

export const updateDepartment = async (req: Request, res: Response) => {
  // #swagger.tags = ['Department']
  // #swagger.security = [{ bearerAuth: [] }]
  // #swagger.requestBody = { schema: { $ref: '#/definitions/CreateDepartmentDto' } }
  const { departmentId } = req.params;
  const data = { ...req.body, id: departmentId };
  const updatedDepartment = await DepartmentService.updateDepartment(data);
  res.status(200).json(updatedDepartment);
};

export const removeDepartment = async (req: Request, res: Response) => {
  // #swagger.tags = ['Department']
  // #swagger.security = [{ bearerAuth: [] }]
  const { departmentId } = req.params;
  await DepartmentService.deleteDepartment(departmentId);
  res.status(204).send();
};
