import { Response } from 'express';
import * as DelegationService from '../services/delegation.service';
import { AddDelegationSchema } from '../schemas/delegation.schema';
import { AuthenticatedRequest } from '../types/auth.type';
import { UserRole } from '@prisma/client';

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
  const { role, unitId } = req.query;
  const data = await DelegationService.getActiveDelegation(
    role as UserRole,
    unitId as string | null
  );
  res.status(200).json(data);
};
