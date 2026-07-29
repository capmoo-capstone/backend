import { Response } from 'express';
import {
  DeadlinesQuerySchema,
  PeriodicSummaryQuerySchema,
  ProcurementOverviewQuerySchema,
  UnitGroupQuerySchema,
  UnitGroupTopDelayedQuerySchema,
} from '../schemas/dashboard.schema';
import * as DashboardService from '../services/dashboard/dashboard.service';
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

export const getOverdueDeadlines = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Dashboard']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = req.user!;
  const { page, limit } = req.query;
  const data = await DashboardService.getOverdueDeadlines(
    payload,
    parseInt(page as string) || 1,
    parseInt(limit as string) || 10
  );
  res.status(200).json(data);
};

export const getDueSoonDeadlines = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Dashboard']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = req.user!;
  const { page, limit } = req.query;
  const data = await DashboardService.getDueSoonDeadlines(
    payload,
    parseInt(page as string) || 1,
    parseInt(limit as string) || 10
  );
  res.status(200).json(data);
};

export const getUnitGroupExecutiveSummary = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Dashboard']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = req.user!;
  const query = UnitGroupQuerySchema.parse(req.query);
  const data = await DashboardService.getUnitGroupExecutiveSummary(
    payload,
    query
  );
  res.status(200).json(data);
};

export const getUnitGroupProcurementMetrics = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Dashboard']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = req.user!;
  const query = UnitGroupQuerySchema.parse(req.query);
  const data = await DashboardService.getUnitGroupProcurementMetrics(
    payload,
    query
  );
  res.status(200).json(data);
};

export const getUnitGroupProcurementDetails = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Dashboard']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = req.user!;
  const query = UnitGroupQuerySchema.parse(req.query);
  const data = await DashboardService.getUnitGroupProcurementDetails(
    payload,
    query
  );
  res.status(200).json(data);
};

export const getUnitGroupTopDelayedProjects = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Dashboard']
  // #swagger.security = [{ bearerAuth: [] }]
  const payload = req.user!;
  const query = UnitGroupTopDelayedQuerySchema.parse(req.query);
  const data = await DashboardService.getUnitGroupTopDelayedProjects(
    payload,
    query
  );
  res.status(200).json(data);
};
