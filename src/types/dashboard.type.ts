import { ProcurementType, ProjectStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/client';

export type DashboardTrend = 'increase' | 'decrease' | 'same';

export interface DashboardMetricComparison {
  current: number;
  previous: number;
  change: number;
  trend: DashboardTrend;
}

export interface PeriodicSummaryResponse {
  period: 'today' | 'month' | 'fiscalYear';
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
  label: string;
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
  mode: 'month' | 'quarter' | 'fiscalYear';
  fiscalYear: number;
  range: {
    from: Date;
    to: Date;
  };
  procurementTypes: Array<{
    type: ProcurementType;
    label: string;
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

export interface DashboardDeadlinePage<T> {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  data: T[];
}

export interface DeadlinesResponse {
  asOf: Date;
  overdue: DashboardDeadlinePage<OverdueProjectRow>;
  dueSoon: DashboardDeadlinePage<DueSoonProjectRow>;
}
