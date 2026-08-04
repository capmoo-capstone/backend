import {
  Prisma,
  ProcurementType,
  ProjectActionType,
  ProjectStatus,
  UserRole,
} from '@prisma/client';
import { prisma } from '../../config/prisma';
import {
  IN_PROGRESS_STATUSES,
  PROCUREMENT_WORKFLOW_TYPES,
} from '../../lib/constant';
import { ForbiddenError } from '../../lib/errors';
import {
  getUnitIdsForUser,
  haveSupplyPermission,
  isSuperAdmin,
} from '../../lib/permissions';
import {
  addBangkokDays,
  daysInBangkokMonth,
  fromBangkokDate,
  nowUtc,
  toBangkokParts,
} from '../../lib/date';
import {
  PeriodicSummaryQuery,
  ProcurementOverviewQuery,
} from '../../schemas/dashboard.schema';
import { AuthPayload } from '../../types/auth.type';
import {
  DashboardStatusPoint,
  DeadlinePriority,
  DueSoonProjectRow,
  OverdueProjectRow,
  PeriodicSummaryResponse,
  ProcurementOverviewResponse,
} from '../../types/dashboard.type';
import { PaginatedResponse } from '../../types/common.type';
import {
  DateRange,
  daysBetweenBangkokDates,
  andWhere,
  projectRangeWhere,
  toComparison,
  getProcurementTypeDonut,
  getPreviousRange,
} from './dashboard.helper';

export const getPeriodicRanges = (
  query: PeriodicSummaryQuery
): { current: DateRange; previous: DateRange } => {
  const current = { from: query.dateFrom, to: query.dateTo };
  const previous = getPreviousRange(current, query.mode);
  return { current, previous };
};

export const getOverviewRange = (
  query: ProcurementOverviewQuery
): { range: DateRange } => {
  const range = { from: query.dateFrom, to: query.dateTo };
  return { range };
};

export const buildVisibilityWhere = (
  user: AuthPayload
): Prisma.ProjectWhereInput => {
  if (haveSupplyPermission(user)) {
    return {};
  }

  const unitIds = getUnitIdsForUser(user);
  return unitIds.length > 0
    ? { requesting_unit_id: { in: unitIds } }
    : { id: { in: [] } };
};

export const completedHistoryWhere = (
  visibilityWhere: Prisma.ProjectWhereInput,
  range: DateRange
): Prisma.ProjectHistoryWhereInput => ({
  action: ProjectActionType.STATUS_UPDATE,
  changed_at: { gte: range.from, lte: range.to },
  new_value: {
    path: ['status'],
    equals: ProjectStatus.CLOSED,
  },
  project: visibilityWhere,
});

export const pendingWorkWhere = (
  visibilityWhere: Prisma.ProjectWhereInput,
  range: DateRange
): Prisma.ProjectWhereInput =>
  andWhere(projectRangeWhere(visibilityWhere, range), {
    status: { in: IN_PROGRESS_STATUSES },
  });

export const getPeriodicSummary = async (
  user: AuthPayload,
  query: PeriodicSummaryQuery
): Promise<PeriodicSummaryResponse> => {
  const ranges = getPeriodicRanges(query);
  const visibilityWhere = buildVisibilityWhere(user);

  const [
    currentNew,
    previousNew,
    currentCompleted,
    previousCompleted,
    currentPending,
    previousPending,
  ] = await prisma.$transaction([
    prisma.project.count({
      where: projectRangeWhere(visibilityWhere, ranges.current),
    }),
    prisma.project.count({
      where: projectRangeWhere(visibilityWhere, ranges.previous),
    }),
    prisma.projectHistory.count({
      where: completedHistoryWhere(visibilityWhere, ranges.current),
    }),
    prisma.projectHistory.count({
      where: completedHistoryWhere(visibilityWhere, ranges.previous),
    }),
    prisma.project.count({
      where: pendingWorkWhere(visibilityWhere, ranges.current),
    }),
    prisma.project.count({
      where: pendingWorkWhere(visibilityWhere, ranges.previous),
    }),
  ]);

  return {
    mode: query.mode,
    range: ranges.current,
    previousRange: ranges.previous,
    newWork: toComparison(currentNew, previousNew),
    completedWork: toComparison(currentCompleted, previousCompleted),
    pendingWork: toComparison(currentPending, previousPending),
  };
};

const statusWhere = (
  visibilityWhere: Prisma.ProjectWhereInput,
  range: DateRange,
  status: ProjectStatus | 'NOT_STARTED'
): Prisma.ProjectWhereInput => {
  const baseWhere = projectRangeWhere(visibilityWhere, range);

  if (status === 'NOT_STARTED') {
    return andWhere(baseWhere, {
      AND: [
        {
          status: {
            in: [ProjectStatus.UNASSIGNED, ProjectStatus.WAITING_ACCEPT],
          },
        },
        { current_workflow_type: { in: PROCUREMENT_WORKFLOW_TYPES } },
      ],
    });
  }

  if (status === ProjectStatus.IN_PROGRESS) {
    return andWhere(baseWhere, { status: { in: IN_PROGRESS_STATUSES } });
  }

  return andWhere(baseWhere, { status });
};

const getStatusBuckets = async (
  user: AuthPayload,
  visibilityWhere: Prisma.ProjectWhereInput,
  range: DateRange
): Promise<DashboardStatusPoint[]> => {
  const statuses: Array<ProjectStatus | 'NOT_STARTED'> = haveSupplyPermission(
    user
  )
    ? [
        ProjectStatus.UNASSIGNED,
        ProjectStatus.WAITING_ACCEPT,
        ProjectStatus.IN_PROGRESS,
        ProjectStatus.CLOSED,
        ProjectStatus.CANCELLED,
      ]
    : [
        'NOT_STARTED',
        ProjectStatus.IN_PROGRESS,
        ProjectStatus.CLOSED,
        ProjectStatus.CANCELLED,
      ];

  const counts = await prisma.$transaction(
    statuses.map((status) =>
      prisma.project.count({
        where: statusWhere(visibilityWhere, range, status),
      })
    )
  );

  return statuses.map((status, index) => ({
    status,
    count: counts[index],
  }));
};

const getBudgetInvestmentDonut = async (
  visibilityWhere: Prisma.ProjectWhereInput,
  range: DateRange
) => {
  const rows = await prisma.budgetPlan.groupBy({
    by: ['budget_name'],
    where: {
      project_id: { not: null },
      project: projectRangeWhere(visibilityWhere, range),
    },
    _count: { _all: true },
    _sum: { budget_amount: true },
    orderBy: { budget_name: 'asc' },
  });

  return rows.map((row) => ({
    category:
      (row as unknown as { budget_name?: string; activity_type_name?: string })
        .budget_name ??
      (row as unknown as { budget_name?: string; activity_type_name?: string })
        .activity_type_name ??
      '',
    planCount: row._count._all,
    amount: row._sum.budget_amount ?? 0,
  }));
};

const thaiMonthLabel = (year: number, month: number): string =>
  `${year}-${month.toString().padStart(2, '0')}`;

const buildTimelineBuckets = (
  mode: ProcurementOverviewQuery['mode'],
  range: DateRange
): DateRange[] => {
  const days = daysBetweenBangkokDates(range.from, range.to);
  const effectiveMode = mode ?? (days <= 31 ? 'month' : 'fiscalYear');

  if (effectiveMode === 'month') {
    const start = toBangkokParts(range.from);
    return Array.from(
      { length: daysInBangkokMonth(start.year, start.month) },
      (_, i) => {
        const day = i + 1;
        return {
          from: fromBangkokDate(start.year, start.month, day),
          to: fromBangkokDate(start.year, start.month, day, true),
        };
      }
    );
  }

  const start = toBangkokParts(range.from);
  const end = toBangkokParts(range.to);
  const buckets: DateRange[] = [];
  let year = start.year;
  let month = start.month;

  while (year < end.year || (year === end.year && month <= end.month)) {
    buckets.push({
      from: fromBangkokDate(year, month, 1),
      to: fromBangkokDate(year, month, daysInBangkokMonth(year, month), true),
    });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return buckets;
};

const getTimelineLine = async (
  visibilityWhere: Prisma.ProjectWhereInput,
  range: DateRange,
  mode: ProcurementOverviewQuery['mode']
) => {
  const days = daysBetweenBangkokDates(range.from, range.to);
  const effectiveMode = mode ?? (days <= 31 ? 'month' : 'fiscalYear');
  const buckets = buildTimelineBuckets(mode, range);

  return Promise.all(
    buckets.map(async (bucket) => {
      const [received, completed] = await prisma.$transaction([
        prisma.project.count({
          where: projectRangeWhere(visibilityWhere, bucket),
        }),
        prisma.projectHistory.count({
          where: completedHistoryWhere(visibilityWhere, bucket),
        }),
      ]);
      const parts = toBangkokParts(bucket.from);

      return {
        label:
          effectiveMode === 'month'
            ? parts.day.toString()
            : thaiMonthLabel(parts.year, parts.month),
        from: bucket.from,
        to: bucket.to,
        received,
        completed,
      };
    })
  );
};

export const getProcurementOverview = async (
  user: AuthPayload,
  query: ProcurementOverviewQuery
): Promise<ProcurementOverviewResponse> => {
  const { range } = getOverviewRange(query);
  const baseVisibilityWhere = buildVisibilityWhere(user);
  const visibilityWhere = query.deptId
    ? andWhere(baseVisibilityWhere, { requesting_dept_id: query.deptId })
    : baseVisibilityWhere;

  const [procurementTypes, statusBar, budgetInvestment, timeline] =
    await Promise.all([
      getProcurementTypeDonut(visibilityWhere, range),
      getStatusBuckets(user, visibilityWhere, range),
      getBudgetInvestmentDonut(visibilityWhere, range),
      getTimelineLine(visibilityWhere, range, query.mode),
    ]);

  return {
    mode: query.mode,
    range,
    procurementTypes,
    statusBar,
    budgetInvestment,
    timeline,
  };
};

const canViewDeadlines = (user: AuthPayload): boolean => {
  if (isSuperAdmin(user)) return true;
  if (!haveSupplyPermission(user)) return false;
  return user.roles.some(
    (role) =>
      role.role === UserRole.GENERAL_STAFF ||
      role.role === UserRole.HEAD_OF_UNIT ||
      role.role === UserRole.HEAD_OF_DEPARTMENT
  );
};

const dueSoonPriority = (daysRemaining: number): DeadlinePriority => {
  if (daysRemaining <= 3) return 'URGENT';
  if (daysRemaining <= 5) return 'WATCH';
  return 'NORMAL';
};

export const getOverdueDeadlines = async (
  user: AuthPayload,
  page: number,
  limit: number
): Promise<PaginatedResponse<OverdueProjectRow>> => {
  if (!canViewDeadlines(user)) {
    throw new ForbiddenError('You do not have permission to view deadlines');
  }

  const now = nowUtc();
  const today = (() => {
    const parts = toBangkokParts(now);
    return fromBangkokDate(parts.year, parts.month, parts.day);
  })();
  const skip = (page - 1) * limit;
  const visibilityWhere = buildVisibilityWhere(user);
  const activeWhere: Prisma.ProjectWhereInput = {
    current_workflow_type: {
      in: PROCUREMENT_WORKFLOW_TYPES,
    },
    expected_approval_date: { not: null },
  };

  const overdueWhere = andWhere(visibilityWhere, activeWhere, {
    expected_approval_date: { lt: today },
  });

  const [projects, total] = await prisma.$transaction([
    prisma.project.findMany({
      where: overdueWhere,
      skip,
      take: limit,
      orderBy: { expected_approval_date: 'asc' },
      select: {
        id: true,
        title: true,
        expected_approval_date: true,
      },
    }),
    prisma.project.count({ where: overdueWhere }),
  ]);

  const rows: OverdueProjectRow[] = projects.map((project) => ({
    projectId: project.id,
    title: project.title,
    dueDate: project.expected_approval_date!,
    daysLate: daysBetweenBangkokDates(project.expected_approval_date!, today),
  }));

  return {
    total,
    page,
    pageSize: limit,
    totalPages: Math.ceil(total / limit),
    data: rows,
  };
};

export const getDueSoonDeadlines = async (
  user: AuthPayload,
  page: number,
  limit: number
): Promise<PaginatedResponse<DueSoonProjectRow>> => {
  if (!canViewDeadlines(user)) {
    throw new ForbiddenError('You do not have permission to view deadlines');
  }

  const now = nowUtc();
  const today = (() => {
    const parts = toBangkokParts(now);
    return fromBangkokDate(parts.year, parts.month, parts.day);
  })();
  const dueSoonEnd = addBangkokDays(today, 7, true);
  const skip = (page - 1) * limit;
  const visibilityWhere = buildVisibilityWhere(user);
  const activeWhere: Prisma.ProjectWhereInput = {
    current_workflow_type: {
      in: PROCUREMENT_WORKFLOW_TYPES,
    },
    expected_approval_date: { not: null },
  };

  const dueSoonWhere = andWhere(visibilityWhere, activeWhere, {
    expected_approval_date: { gte: today, lte: dueSoonEnd },
  });

  const [projects, total] = await prisma.$transaction([
    prisma.project.findMany({
      where: dueSoonWhere,
      skip,
      take: limit,
      orderBy: { expected_approval_date: 'asc' },
      select: {
        id: true,
        title: true,
        expected_approval_date: true,
      },
    }),
    prisma.project.count({ where: dueSoonWhere }),
  ]);

  const rows: DueSoonProjectRow[] = projects.map((project) => {
    const dueDate = project.expected_approval_date!;
    const daysRemaining = daysBetweenBangkokDates(today, dueDate);
    return {
      projectId: project.id,
      title: project.title,
      dueDate,
      daysRemaining,
      priority: dueSoonPriority(daysRemaining),
    };
  });

  return {
    total,
    page,
    pageSize: limit,
    totalPages: Math.ceil(total / limit),
    data: rows,
  };
};
