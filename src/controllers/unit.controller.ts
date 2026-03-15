import { Request, Response } from 'express';
import * as UnitService from '../services/unit.service';
import { CreateUnitSchema, UpdateUnitSchema } from '../schemas/unit.schema';

export const getAll = async (req: Request, res: Response) => {
  // #swagger.tags = ['Unit']
  // #swagger.security = [{ bearerAuth: [] }]
  const { page, limit } = req.query;
  const data = await UnitService.listUnits(
    parseInt(page as string) || 1,
    parseInt(limit as string) || 10
  );
  res.status(200).json(data);
};

export const getById = async (req: Request, res: Response) => {
  // #swagger.tags = ['Unit']
  // #swagger.security = [{ bearerAuth: [] }]
  const unitId = req.params.id as string;
  const unit = await UnitService.getById(unitId);
  res.status(200).json(unit);
};

export const createUnit = async (req: Request, res: Response) => {
  // #swagger.tags = ['Unit']
  // #swagger.security = [{ bearerAuth: [] }]
  // #swagger.requestBody = { schema: { $ref: '#/definitions/CreateUnitDto' } }
  const validatedData = CreateUnitSchema.parse(req.body);
  const unit = await UnitService.createUnit(validatedData);
  res.status(201).json(unit);
};

export const updateUnit = async (req: Request, res: Response) => {
  // #swagger.tags = ['Unit']
  // #swagger.security = [{ bearerAuth: [] }]
  // #swagger.requestBody = { schema: { $ref: '#/definitions/CreateUnitDto' } }
  const unitId = req.params.id as string;
  const validatedData = UpdateUnitSchema.parse({ ...req.body, id: unitId });
  const updatedUnit = await UnitService.updateUnit(validatedData);
  res.status(200).json(updatedUnit);
};

export const removeUnit = async (req: Request, res: Response) => {
  // #swagger.tags = ['Unit']
  // #swagger.security = [{ bearerAuth: [] }]
  const unitId = req.params.id as string;
  await UnitService.deleteUnit(unitId);
  res.status(204).send();
};
