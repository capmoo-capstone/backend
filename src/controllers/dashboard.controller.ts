import { Response } from 'express';
import {
  DeadlinesQuerySchema,
  PeriodicSummaryQuerySchema,
  ProcurementOverviewQuerySchema,
} from '../schemas/dashboard.schema';
import * as DashboardService from '../services/dashboard.service';
import { AuthenticatedRequest } from '../types/auth.type';

export const getPeriodicSummary = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Dashboard']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = req.user!;
  const query = PeriodicSummaryQuerySchema.parse(req.query);
  const data = await DashboardService.getPeriodicSummary(payload, query);
  res.status(200).json(data);
};

export const getProcurementOverview = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Dashboard']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = req.user!;
  const query = ProcurementOverviewQuerySchema.parse(req.query);
  const data = await DashboardService.getProcurementOverview(payload, query);
  res.status(200).json(data);
};

export const getDeadlines = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Dashboard']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = req.user!;
  const query = DeadlinesQuerySchema.parse(req.query);
  const data = await DashboardService.getDeadlines(payload, query);
  res.status(200).json(data);
};
