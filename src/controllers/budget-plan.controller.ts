import { Response } from 'express';
import * as BudgetPlanService from '../services/budget-plan.service';
import { ImportBudgetPlanSchema } from '../schemas/budget-plan.schema';
import { AuthenticatedRequest } from '../types/auth.type';

export const getAll = async (req: AuthenticatedRequest, res: Response) => {
  // #swagger.tags = ['Budget Plan']
  // #swagger.security = [{ bearerAuth: [] }]
  const { page, limit, unitId, available } = req.query;
  const payload = req.user!;
  const data = await BudgetPlanService.listBudgetPlans(
    payload,
    unitId as string,
    parseInt(page as string) || 1,
    parseInt(limit as string) || 10,
    available === 'true' // Convert to boolean
  );
  res.status(200).json(data);
};

export const importBudgetPlan = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Budget Plan']
  // #swagger.security = [{ bearerAuth: [] }]
  // #swagger.requestBody = { schema: { $ref: '#/definitions/ImportBudgetPlanDto' } }
  const payload = req.user!;

  const validatedData = ImportBudgetPlanSchema.parse(req.body);
  const data = await BudgetPlanService.importBudgetPlan(payload, validatedData);
  res.status(201).json(data);
};

export const updateProjectIdPlan = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Budget Plan']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = req.user!;
  const id = req.params.id as string;
  const projectId = req.params.projectId as string;
  const data = await BudgetPlanService.updateProjectIdPlan(
    payload,
    id,
    projectId
  );
  res.status(200).json(data);
};

export const removeBudgetPlan = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Budget Plan']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = req.user!;
  const id = req.params.id as string;
  await BudgetPlanService.deleteBudgetPlan(payload, id);
  res.status(204).send();
};
