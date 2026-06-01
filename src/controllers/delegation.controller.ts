import { Response } from 'express';
import {
  AddDelegationSchema,
  GetActiveDelegationQuerySchema,
} from '../schemas/delegation.schema';
import * as DelegationService from '../services/delegation.service';
import { AuthenticatedRequest } from '../types/auth.type';

export const addDelegation = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Delegation']
  // #swagger.security = [{ bearerAuth: [] }]
  const user = req.user!;
  const { delegator_id, delegatee_id, start_date, end_date } = req.body;
  const validatedData = AddDelegationSchema.parse({
    delegator_id,
    delegatee_id,
    start_date,
    end_date: end_date ?? undefined,
  });

  const data = await DelegationService.addDelegation(user, validatedData);
  res.status(201).json(data);
};

export const cancelDelegation = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Delegation']
  // #swagger.security = [{ bearerAuth: [] }]
  const user = req.user!;
  const id = req.params.id as string;
  const data = await DelegationService.cancelDelegation(user, id);
  res.status(200).json(data);
};

export const getById = async (req: AuthenticatedRequest, res: Response) => {
  // #swagger.tags = ['Delegation']
  // #swagger.security = [{ bearerAuth: [] }]
  const id = req.params.id as string;
  const data = await DelegationService.getById(id);
  res.status(200).json(data);
};

export const getActiveDelegation = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Delegation']
  // #swagger.security = [{ bearerAuth: [] }]
  const user = req.user!;
  const { role, unitId } = req.query;

  const validatedQuery = GetActiveDelegationQuerySchema.parse({
    role,
    unitId,
  });

  const data = await DelegationService.getActiveDelegation(
    validatedQuery.role,
    validatedQuery.unitId
  );
  res.status(200).json(data);
};
