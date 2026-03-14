import { Request, Response } from 'express';
import * as BudgetPlanService from '../services/budget-plan.service';
import { ImportBudgetPlanSchema } from '../models/BudgetPlan';

export const getAll = async (req: Request, res: Response) => {
  // #swagger.tags = ['Budget Plan']
  // #swagger.security = [{ bearerAuth: [] }]
  const { page, limit } = req.query;
  const payload = (req as any).user;
  const data = await BudgetPlanService.listBudgetPlans(
    payload,
    parseInt(page as string) || 1,
    parseInt(limit as string) || 10
  );
  res.status(200).json(data);
};

export const importBudgetPlan = async (req: Request, res: Response) => {
  // #swagger.tags = ['Budget Plan']
  // #swagger.security = [{ bearerAuth: [] }]
  // #swagger.requestBody = { schema: { $ref: '#/definitions/ImportBudgetPlanDto' } }
  const payload = (req as any).user;

  const validatedData = ImportBudgetPlanSchema.parse(req.body);
  const data = await BudgetPlanService.importBudgetPlan(payload, validatedData);
  res.status(201).json(data);
};

export const updateProjectIdPlan = async (req: Request, res: Response) => {
  // #swagger.tags = ['Budget Plan']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = (req as any).user;
  const id = req.params.id as string;
  const projectId = req.params.projectId as string;
  const data = await BudgetPlanService.updateProjectIdPlan(
    payload,
    id,
    projectId
  );
  res.status(200).json(data);
};

export const removeBudgetPlan = async (req: Request, res: Response) => {
  // #swagger.tags = ['Budget Plan']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = (req as any).user;
  const id = req.params.id as string;
  await BudgetPlanService.deleteBudgetPlan(payload, id);
  res.status(204).send();
};
