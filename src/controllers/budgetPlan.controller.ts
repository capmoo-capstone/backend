import { Request, Response } from 'express';
import * as BudgetPlanService from '../service/budgetplan.service';

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
  const data = await BudgetPlanService.importBudgetPlan(req.body);
  res.status(201).json(data);
};

export const updateProjectIdPlan = async (req: Request, res: Response) => {
  // #swagger.tags = ['Budget Plan']
  // #swagger.security = [{ bearerAuth: [] }]
  const id = req.params.id as string;
  const projectId = req.params.projectId as string;
  const data = await BudgetPlanService.updateProjectIdPlan(id, projectId);
  res.status(200).json(data);
};

export const removeBudgetPlan = async (req: Request, res: Response) => {
  // #swagger.tags = ['Budget Plan']
  // #swagger.security = [{ bearerAuth: [] }]
  const id = req.params.id as string;
  const data = await BudgetPlanService.deleteBudgetPlan(id);
  res.status(200).json(data);
};
