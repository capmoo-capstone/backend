import { ProcurementType, ProjectStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/client';
import { PaginatedResponse } from './common.type';
import { DashboardMode } from '../schemas/dashboard.schema';

export type DashboardTrend = 'increase' | 'decrease' | 'same';

export interface DashboardMetricComparison {
  current: number;
  previous: number;
  change: number;
  trend: DashboardTrend;
}

export interface PeriodicSummaryResponse {
  mode: 'today' | 'month' | 'quarter' | 'fiscalYear';
  range: {
    from: Date;
    to: Date;
  };
  previousRange: {
    from: Date;
    to: Date;
  };
  newWork: DashboardMetricComparison;
  completedWork: DashboardMetricComparison;
  pendingWork: DashboardMetricComparison;
}

export interface DashboardChartPoint {
  label: string;
  count: number;
}

export interface DashboardStatusPoint {
  status: ProjectStatus | 'NOT_STARTED';
  count: number;
}

export interface DashboardBudgetPoint {
  category: string;
  planCount: number;
  amount: Decimal | number;
}

export interface DashboardTimelinePoint {
  label: string;
  from: Date;
  to: Date;
  received: number;
  completed: number;
}

export interface ProcurementOverviewResponse {
  mode: DashboardMode;
  range: {
    from: Date;
    to: Date;
  };
  procurementTypes: Array<{
    type: ProcurementType;
    count: number;
  }>;
  statusBar: DashboardStatusPoint[];
  budgetInvestment: DashboardBudgetPoint[];
  timeline: DashboardTimelinePoint[];
}

export type DeadlinePriority = 'URGENT' | 'WATCH' | 'NORMAL';

export interface DeadlineProjectRow {
  projectId: string;
  title: string;
  dueDate: Date;
}

export interface OverdueProjectRow extends DeadlineProjectRow {
  daysLate: number;
}

export interface DueSoonProjectRow extends DeadlineProjectRow {
  daysRemaining: number;
  priority: DeadlinePriority;
}

export interface OverdueProjectResponse extends PaginatedResponse<OverdueProjectRow> {}

export interface DueSoonProjectResponse extends PaginatedResponse<DueSoonProjectRow> {}

// --- Unit Group KPI Dashboard Types ---

export interface WorkloadVsDurationPoint {
  label: string;
  from: Date;
  to: Date;
  workloadCount: number;
  avgDurationDays: number;
}

export interface UnitGroupExecutiveSummaryResponse {
  unitId: string;
  mode: 'today' | 'month' | 'quarter' | 'fiscalYear';
  range: { from: Date; to: Date };
  longestProcurementMethod: ProcurementType | null;
  avgDurationDays: DashboardMetricComparison;
  onTimeCompletionPercentage: DashboardMetricComparison;
  workloadVsDurationTimeline: WorkloadVsDurationPoint[];
}

export interface UnitGroupProcurementMetricsResponse {
  unitId: string;
  totalProjects: {
    total: number;
    byProcurementType: Array<{ type: ProcurementType; count: number }>;
  };
  delayedProjects: {
    total: number;
    byProcurementType: Array<{ type: ProcurementType; count: number }>;
  };
}

export interface ProcurementMethodDetailItem {
  procurementType: ProcurementType;
  delayedCount: number;
  totalCount: number;
  delayedPercentage: number;
  comparisonTrend: DashboardTrend;
  statusDistribution: Array<{
    status: ProjectStatus | 'NOT_STARTED';
    count: number;
  }>;
  avgPhaseDurationDays: {
    procurementPhaseDays: number;
    contractPhaseDays: number;
  };
}

export interface UnitGroupProcurementDetailsResponse {
  unitId: string;
  mode: DashboardMode;
  range: {
    from: Date;
    to: Date;
  };
  methods: ProcurementMethodDetailItem[];
}

export interface TopDelayedProjectItem {
  projectId: string;
  title: string;
  procurementType: ProcurementType;
  totalDays: number;
  stageBreakdownDays: {
    taskAssignmentDays: number;
    procurementPhaseDays: number;
    contractPhaseDays: number;
    inspectionApprovalDays: number;
    revisionDays: number;
  };
}

export interface UnitGroupTopDelayedProjectsResponse {
  unitId: string;
  procurementTypeFilter: ProcurementType | null;
  projects: TopDelayedProjectItem[];
}
