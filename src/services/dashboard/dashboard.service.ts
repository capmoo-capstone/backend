import {
  DeadlinesQuery,
  PeriodicSummaryQuery,
  ProcurementOverviewQuery,
  UnitGroupOverviewQuery,
  UnitGroupProcurementQuery,
  UnitGroupTopDelayedQuery,
} from '../../schemas/dashboard.schema';
import { AuthPayload } from '../../types/auth.type';
import {
  DueSoonProjectRow,
  OverdueProjectRow,
  PeriodicSummaryResponse,
  ProcurementOverviewResponse,
  UnitGroupExecutiveSummaryResponse,
  UnitGroupProcurementDetailsResponse,
  UnitGroupProcurementMetricsResponse,
  UnitGroupTopDelayedProjectsResponse,
} from '../../types/dashboard.type';
import { PaginatedResponse } from '../../types/common.type';
import * as overviewHelper from './overview-dashboard.helper';
import * as kpiHelper from './kpi-dashboard.helper';

export const getPeriodicSummary = (
  user: AuthPayload,
  query: PeriodicSummaryQuery
): Promise<PeriodicSummaryResponse> =>
  overviewHelper.getPeriodicSummary(user, query);

export const getProcurementOverview = (
  user: AuthPayload,
  query: ProcurementOverviewQuery
): Promise<ProcurementOverviewResponse> =>
  overviewHelper.getProcurementOverview(user, query);

export const getOverdueDeadlines = (
  user: AuthPayload,
  query: DeadlinesQuery
): Promise<PaginatedResponse<OverdueProjectRow>> =>
  overviewHelper.getOverdueDeadlines(user, query);

export const getDueSoonDeadlines = (
  user: AuthPayload,
  query: DeadlinesQuery
): Promise<PaginatedResponse<DueSoonProjectRow>> =>
  overviewHelper.getDueSoonDeadlines(user, query);

export const getUnitGroupExecutiveSummary = (
  user: AuthPayload,
  query: UnitGroupOverviewQuery
): Promise<UnitGroupExecutiveSummaryResponse> =>
  kpiHelper.getUnitGroupExecutiveSummary(user, query);

export const getUnitGroupProcurementMetrics = (
  user: AuthPayload,
  query: UnitGroupProcurementQuery
): Promise<UnitGroupProcurementMetricsResponse> =>
  kpiHelper.getUnitGroupProcurementMetrics(user, query);

export const getUnitGroupProcurementDetails = (
  user: AuthPayload,
  query: UnitGroupProcurementQuery
): Promise<UnitGroupProcurementDetailsResponse> =>
  kpiHelper.getUnitGroupProcurementDetails(user, query);

export const getUnitGroupTopDelayedProjects = (
  user: AuthPayload,
  query: UnitGroupTopDelayedQuery
): Promise<UnitGroupTopDelayedProjectsResponse> =>
  kpiHelper.getUnitGroupTopDelayedProjects(user, query);

