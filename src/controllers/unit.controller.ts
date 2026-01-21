import { Request, Response } from 'express';
import * as UnitService from '../service/unit.service';

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
  const { unitId } = req.params;
  const unit = await UnitService.getById(unitId);
  res.status(200).json(unit);
};

export const createUnit = async (req: Request, res: Response) => {
  // #swagger.tags = ['Unit']
  // #swagger.security = [{ bearerAuth: [] }]
  // #swagger.requestBody = { schema: { $ref: '#/definitions/CreateUnitDto' } }
  const unit = await UnitService.createUnit(req.body);
  res.status(201).json(unit);
};

export const addUsersToUnit = async (req: Request, res: Response) => {
  // #swagger.tags = ['Unit']
  // #swagger.security = [{ bearerAuth: [] }]
  const { unitId } = req.params;

  if (!unitId) {
    return res
      .status(400)
      .json({ status: 'error', message: 'Unit ID is required' });
  }

  if (!req.body.user_id || !Array.isArray(req.body.user_id)) {
    return res.status(400).json({
      status: 'error',
      message: 'User ID is required and should be an array of UUIDs',
    });
  }

  const data = { ...req.body, unit_id: unitId };
  const updatedUser = await UnitService.addUsersToUnit(data);
  res.status(200).json(updatedUser);
};

export const updateUnit = async (req: Request, res: Response) => {
  // #swagger.tags = ['Unit']
  // #swagger.security = [{ bearerAuth: [] }]
  // #swagger.requestBody = { schema: { $ref: '#/definitions/CreateUnitDto' } }
  const { unitId } = req.params;
  const data = { ...req.body, id: unitId };
  const updatedUnit = await UnitService.updateUnit(data);
  res.status(200).json(updatedUnit);
};

export const removeUnit = async (req: Request, res: Response) => {
  // #swagger.tags = ['Unit']
  // #swagger.security = [{ bearerAuth: [] }]
  const { unitId } = req.params;
  await UnitService.deleteUnit(unitId);
  res.status(204).send();
};
