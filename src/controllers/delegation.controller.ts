import { Request, Response } from 'express';
import * as DelegationService from '../services/delegation.service';
import { AddDelegationSchema } from '../models/Delegation';

export const addDelegation = async (req: Request, res: Response) => {
  // #swagger.tags = ['Delegation']
  // #swagger.security = [{ bearerAuth: [] }]
  const { delegator_id, delegatee_id, start_date, end_date } = req.body;
  const validatedData = AddDelegationSchema.parse({
    delegator_id,
    delegatee_id,
    start_date,
    end_date: end_date ?? undefined,
  });

  const data = await DelegationService.addDelegation(validatedData);
  res.status(201).json(data);
};

export const cancelDelegation = async (req: Request, res: Response) => {
  // #swagger.tags = ['Delegation']
  // #swagger.security = [{ bearerAuth: [] }]
  const id = req.params.id as string;
  const data = await DelegationService.cancelDelegation(id);
  res.status(200).json(data);
};

export const getById = async (req: Request, res: Response) => {
  // #swagger.tags = ['Delegation']
  // #swagger.security = [{ bearerAuth: [] }]
  const id = req.params.id as string;
  const data = await DelegationService.getById(id);
  res.status(200).json(data);
};
