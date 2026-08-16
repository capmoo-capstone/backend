import {
  PeriodicSummaryQuery,
  ProcurementOverviewQuery,
  UnitGroupQuery,
  UnitGroupStaffPerformanceQuery,
  UnitGroupTopDelayedQuery,
  IndividualDashboardQuery,
  IndividualTodoQuery,
  IndividualTodoTotalQuery,
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
  UnitGroupStaffPerformanceResponse,
  UnitGroupTopDelayedProjectsResponse,
  ContractUnitSummaryResponse,
  IndividualDashboardResponse,
} from '../../types/dashboard.type';
import { PaginatedResponse } from '../../types/common.type';
import { PaginatedProjects } from '../../types/project.type';
import * as overviewHelper from './overview-dashboard.helper';
import * as kpiHelper from './kpi-dashboard.helper';
import * as individualHelper from './individual-dashboard.helper';

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
  page: number,
  limit: number
): Promise<PaginatedResponse<OverdueProjectRow>> =>
  overviewHelper.getOverdueDeadlines(user, page, limit);

export const getDueSoonDeadlines = (
  user: AuthPayload,
  page: number,
  limit: number
): Promise<PaginatedResponse<DueSoonProjectRow>> =>
  overviewHelper.getDueSoonDeadlines(user, page, limit);

export const getUnitGroupExecutiveSummary = (
  user: AuthPayload,
  query: UnitGroupQuery
): Promise<UnitGroupExecutiveSummaryResponse> =>
  kpiHelper.getUnitGroupExecutiveSummary(user, query);

export const getUnitGroupProcurementMetrics = (
  user: AuthPayload,
  query: UnitGroupQuery
): Promise<UnitGroupProcurementMetricsResponse> =>
  kpiHelper.getUnitGroupProcurementMetrics(user, query);

export const getUnitGroupProcurementDetails = (
  user: AuthPayload,
  query: UnitGroupQuery
): Promise<UnitGroupProcurementDetailsResponse> =>
  kpiHelper.getUnitGroupProcurementDetails(user, query);

export const getUnitGroupTopDelayedProjects = (
  user: AuthPayload,
  query: UnitGroupTopDelayedQuery
): Promise<UnitGroupTopDelayedProjectsResponse> =>
  kpiHelper.getUnitGroupTopDelayedProjects(user, query);

export const getUnitGroupStaffPerformance = (
  user: AuthPayload,
  query: UnitGroupStaffPerformanceQuery
): Promise<UnitGroupStaffPerformanceResponse> =>
  kpiHelper.getUnitGroupStaffPerformance(user, query);

export const getContractUnitSummary = (
  user: AuthPayload,
  query: UnitGroupQuery
): Promise<ContractUnitSummaryResponse> =>
  kpiHelper.getContractUnitSummary(user, query);

export const getIndividualStaffDashboard = (
  user: AuthPayload,
  query: IndividualDashboardQuery
): Promise<IndividualDashboardResponse> =>
  individualHelper.getIndividualStaffDashboard(user, query);

export const getIndividualStaffTodo = (
  query: IndividualTodoQuery
): Promise<PaginatedProjects> => individualHelper.getIndividualStaffTodo(query);

export const getIndividualStaffTodoTotal = (
  query: IndividualTodoTotalQuery
): Promise<Record<string, number>> =>
  individualHelper.getIndividualStaffTodoTotal(query);
