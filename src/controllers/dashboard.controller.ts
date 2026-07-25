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
  const { period } = req.query;
  const query = PeriodicSummaryQuerySchema.parse({ period });
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
  const { mode, fiscalYear, month, quarter } = req.query;
  const query = ProcurementOverviewQuerySchema.parse({
    mode,
    fiscalYear,
    month,
    quarter,
  });
  const data = await DashboardService.getProcurementOverview(payload, query);
  res.status(200).json(data);
};

export const getOverdueDeadlines = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Dashboard']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = req.user!;
  const query = DeadlinesQuerySchema.parse(req.query);
  const data = await DashboardService.getOverdueDeadlines(payload, query);
  res.status(200).json(data);
};

export const getDueSoonDeadlines = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Dashboard']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = req.user!;
  const query = DeadlinesQuerySchema.parse(req.query);
  const data = await DashboardService.getDueSoonDeadlines(payload, query);
  res.status(200).json(data);
};
