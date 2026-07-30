import {
  Prisma,
  ProcurementType,
  ProjectStatus,
  UserRole,
} from '@prisma/client';
import { prisma } from '../../config/prisma';
import {
  bangkokDayEndUtc,
  bangkokDayStartUtc,
  daysInBangkokMonth,
  fromBangkokDate,
  nowUtc,
  toBangkokParts,
} from '../../lib/date';
import { NotFoundError } from '../../lib/errors';
import {
  countBangkokWorkingDays,
  createBangkokWorkingDayHolidayIndex,
} from '../../lib/working-days';
import {
  UnitGroupQuery,
  UnitGroupStaffPerformanceQuery,
  UnitGroupTopDelayedQuery,
} from '../../schemas/dashboard.schema';
import { AuthPayload } from '../../types/auth.type';
import {
  ProcurementMethodDetailItem,
  TopDelayedProjectItem,
  UnitGroupExecutiveSummaryResponse,
  UnitGroupProcurementDetailsResponse,
  UnitGroupProcurementMetricsResponse,
  UnitGroupStaffPerformanceResponse,
  UnitGroupTopDelayedProjectsResponse,
  WorkloadVsDurationPoint,
} from '../../types/dashboard.type';
import { getHolidayDates } from '../holiday.service';
import {
  daysBetweenBangkokDates,
  getPreviousRange,
  getProcurementTypeDonut,
  projectRangeWhere,
  resolveTargetUnitId,
  toComparison,
} from './dashboard.helper';
import { IN_PROGRESS_STATUSES } from '../../lib/constant';

type CompletedPhase = {
  startedAt: Date;
  completedAt: Date;
  assigneeIds: string[];
};

const isCompletedInRange = (
  startedAt: Date | null,
  completedAt: Date | null,
  range: { from: Date; to: Date }
): startedAt is Date =>
  startedAt !== null &&
  completedAt !== null &&
  completedAt >= range.from &&
  completedAt <= range.to;

export const getUnitGroupStaffPerformance = async (
  user: AuthPayload,
  query: UnitGroupStaffPerformanceQuery
): Promise<UnitGroupStaffPerformanceResponse> => {
  const unitId = resolveTargetUnitId(user, query.unitId);
  const range = { from: query.dateFrom, to: query.dateTo };

  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
    select: { id: true },
  });
  if (!unit) {
    throw new NotFoundError('Unit not found');
  }

  const staff = await prisma.user.findMany({
    where: {
      roles: {
        some: {
          unit_id: unitId,
          role: UserRole.GENERAL_STAFF,
        },
      },
    },
    select: { id: true, full_name: true },
  });
  const staffIds = staff.map((member) => member.id);

  const projects =
    staffIds.length === 0
      ? []
      : await prisma.project.findMany({
          where: {
            OR: [
              {
                procurement_started_at: { not: null },
                procurement_completed_at: {
                  gte: range.from,
                  lte: range.to,
                },
                assignee_procurement: { some: { id: { in: staffIds } } },
              },
              {
                contract_started_at: { not: null },
                contract_completed_at: { gte: range.from, lte: range.to },
                assignee_contract: { some: { id: { in: staffIds } } },
              },
            ],
          },
          select: {
            procurement_started_at: true,
            procurement_completed_at: true,
            contract_started_at: true,
            contract_completed_at: true,
            assignee_procurement: { select: { id: true } },
            assignee_contract: { select: { id: true } },
          },
        });

  const completedPhases: CompletedPhase[] = [];
  for (const project of projects) {
    if (
      isCompletedInRange(
        project.procurement_started_at,
        project.procurement_completed_at,
        range
      )
    ) {
      completedPhases.push({
        startedAt: project.procurement_started_at,
        completedAt: project.procurement_completed_at!,
        assigneeIds: project.assignee_procurement.map(
          (assignee) => assignee.id
        ),
      });
    }

    if (
      isCompletedInRange(
        project.contract_started_at,
        project.contract_completed_at,
        range
      )
    ) {
      completedPhases.push({
        startedAt: project.contract_started_at,
        completedAt: project.contract_completed_at!,
        assigneeIds: project.assignee_contract.map((assignee) => assignee.id),
      });
    }
  }

  const holidayDates =
    completedPhases.length === 0
      ? new Set<string>()
      : await getHolidayDates(
          bangkokDayStartUtc(
            completedPhases.reduce(
              (earliest, phase) =>
                phase.startedAt < earliest ? phase.startedAt : earliest,
              completedPhases[0].startedAt
            )
          ),
          bangkokDayEndUtc(
            completedPhases.reduce(
              (latest, phase) =>
                phase.completedAt > latest ? phase.completedAt : latest,
              completedPhases[0].completedAt
            )
          )
        );
  const holidayIndex = createBangkokWorkingDayHolidayIndex(holidayDates);

  const staffTotals = new Map(
    staff.map((member) => [
      member.id,
      { fullName: member.full_name, projectCount: 0, totalWorkingDays: 0 },
    ])
  );

  for (const phase of completedPhases) {
    const duration = countBangkokWorkingDays(
      phase.startedAt,
      phase.completedAt,
      holidayIndex
    );
    for (const assigneeId of new Set(phase.assigneeIds)) {
      const total = staffTotals.get(assigneeId);
      if (total) {
        total.projectCount++;
        total.totalWorkingDays += duration;
      }
    }
  }

  const rows = [...staffTotals.entries()]
    .map(([userId, total]) => ({
      userId,
      fullName: total.fullName,
      projectCount: total.projectCount,
      avgWorkingDurationDays:
        total.projectCount === 0
          ? null
          : Math.round(total.totalWorkingDays / total.projectCount),
    }))
    .sort(
      (left, right) =>
        right.projectCount - left.projectCount ||
        left.fullName.localeCompare(right.fullName)
    );

  const total = rows.length;
  const totalPages = Math.ceil(total / query.limit);
  const start = (query.page - 1) * query.limit;

  return {
    unitId,
    mode: query.mode,
    range,
    total,
    page: query.page,
    pageSize: query.limit,
    totalPages,
    data: rows.slice(start, start + query.limit),
  };
};

export const getUnitGroupExecutiveSummary = async (
  user: AuthPayload,
  query: UnitGroupQuery
): Promise<UnitGroupExecutiveSummaryResponse> => {
  const unitId = resolveTargetUnitId(user, query.unitId);
  const range = { from: query.dateFrom, to: query.dateTo };
  const previousRange = getPreviousRange(range, query.mode);

  const unitWhere: Prisma.ProjectWhereInput = {
    OR: [{ responsible_unit_id: unitId }, { requesting_unit_id: unitId }],
  };

  const currentWhere = projectRangeWhere(unitWhere, range);
  const previousWhere = projectRangeWhere(unitWhere, previousRange);

  const [currentProjects, previousProjects] = await Promise.all([
    prisma.project.findMany({
      where: currentWhere,
      select: {
        id: true,
        procurement_type: true,
        status: true,
        created_at: true,
        updated_at: true,
        expected_approval_date: true,
      },
    }),
    prisma.project.findMany({
      where: previousWhere,
      select: {
        id: true,
        status: true,
        created_at: true,
        updated_at: true,
        expected_approval_date: true,
      },
    }),
  ]);

  // Longest procurement method
  const methodDurations: Record<string, { totalDays: number; count: number }> =
    {};
  for (const p of currentProjects) {
    const end =
      p.status === ProjectStatus.CLOSED ? (p.updated_at ?? nowUtc()) : nowUtc();
    const durationDays = daysBetweenBangkokDates(p.created_at, end);
    const type = p.procurement_type;
    if (!methodDurations[type]) {
      methodDurations[type] = { totalDays: 0, count: 0 };
    }
    methodDurations[type].totalDays += durationDays;
    methodDurations[type].count += 1;
  }

  let longestMethod: ProcurementType | null = null;
  let maxAvgDays = -1;
  for (const [type, data] of Object.entries(methodDurations)) {
    const avg = data.count > 0 ? data.totalDays / data.count : 0;
    if (avg > maxAvgDays) {
      maxAvgDays = avg;
      longestMethod = type as ProcurementType;
    }
  }

  // Average duration
  const calcAvgDuration = (
    projects: Array<{
      created_at: Date;
      updated_at: Date | null;
      status: ProjectStatus;
    }>
  ) => {
    if (projects.length === 0) return 0;
    const total = projects.reduce((acc, p) => {
      const end =
        p.status === ProjectStatus.CLOSED
          ? (p.updated_at ?? nowUtc())
          : nowUtc();
      return acc + daysBetweenBangkokDates(p.created_at, end);
    }, 0);
    return Math.round(total / projects.length);
  };

  const currAvgDuration = calcAvgDuration(currentProjects);
  const prevAvgDuration = calcAvgDuration(previousProjects);
  const avgDurationComparison = toComparison(currAvgDuration, prevAvgDuration);

  // On-time completion %
  const calcOnTimePct = (
    projects: Array<{
      status: ProjectStatus;
      updated_at: Date | null;
      expected_approval_date: Date | null;
    }>
  ) => {
    const completed = projects.filter((p) => p.status === ProjectStatus.CLOSED);
    if (completed.length === 0) return 100;
    const onTime = completed.filter((p) => {
      if (!p.expected_approval_date) return true;
      const closedAt = p.updated_at ?? nowUtc();
      return closedAt <= p.expected_approval_date;
    });
    return Math.round((onTime.length / completed.length) * 100);
  };

  const currOnTime = calcOnTimePct(currentProjects);
  const prevOnTime = calcOnTimePct(previousProjects);
  const onTimeComparison = toComparison(currOnTime, prevOnTime);

  // Workload vs Duration timeline
  const startParts = toBangkokParts(range.from);
  const endParts = toBangkokParts(range.to);
  const timelinePoints: WorkloadVsDurationPoint[] = [];

  let curY = startParts.year;
  let curM = startParts.month;
  while (
    curY < endParts.year ||
    (curY === endParts.year && curM <= endParts.month)
  ) {
    const bucketFrom = fromBangkokDate(curY, curM, 1);
    const bucketTo = fromBangkokDate(
      curY,
      curM,
      daysInBangkokMonth(curY, curM),
      true
    );
    const bucketProjects = currentProjects.filter(
      (p) => p.created_at >= bucketFrom && p.created_at <= bucketTo
    );
    const avgDur = calcAvgDuration(bucketProjects);

    timelinePoints.push({
      label: `${curY}-${curM.toString().padStart(2, '0')}`,
      from: bucketFrom,
      to: bucketTo,
      workloadCount: bucketProjects.length,
      avgDurationDays: avgDur,
    });

    curM += 1;
    if (curM > 12) {
      curM = 1;
      curY += 1;
    }
  }

  return {
    unitId,
    mode: query.mode,
    range,
    longestProcurementMethod: longestMethod,
    avgDurationDays: avgDurationComparison,
    onTimeCompletionPercentage: onTimeComparison,
    workloadVsDurationTimeline: timelinePoints,
  };
};

const getUnitProcurementTypes = async (
  unitId: string
): Promise<ProcurementType[]> => {
  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
    select: { type: true },
  });
  if (!unit || !unit.type) {
    return Object.values(ProcurementType);
  }
  if (unit.type.length === 0) {
    return [];
  }
  const validTypes = new Set(Object.values(ProcurementType));
  return unit.type
    .filter((t) => validTypes.has(t as unknown as ProcurementType))
    .map((t) => t as unknown as ProcurementType);
};

export const getUnitGroupProcurementMetrics = async (
  user: AuthPayload,
  query: UnitGroupQuery
): Promise<UnitGroupProcurementMetricsResponse> => {
  const unitId = resolveTargetUnitId(user, query.unitId);
  const range = { from: query.dateFrom, to: query.dateTo };
  const now = nowUtc();
  const today = fromBangkokDate(
    toBangkokParts(now).year,
    toBangkokParts(now).month,
    toBangkokParts(now).day
  );

  const unitWhere: Prisma.ProjectWhereInput = {
    responsible_unit_id: unitId,
  };

  const delayedWhere: Prisma.ProjectWhereInput = {
    status: { in: IN_PROGRESS_STATUSES },
    expected_approval_date: { lt: today },
  };

  const types = await getUnitProcurementTypes(unitId);

  const [byTotalType, byDelayedType] = await Promise.all([
    getProcurementTypeDonut(unitWhere, range, types),
    getProcurementTypeDonut(unitWhere, range, types, delayedWhere),
  ]);

  const total = byTotalType.reduce((sum, item) => sum + item.count, 0);
  const delayedTotal = byDelayedType.reduce((sum, item) => sum + item.count, 0);

  return {
    unitId,
    totalProjects: {
      total,
      byProcurementType: byTotalType,
    },
    delayedProjects: {
      total: delayedTotal,
      byProcurementType: byDelayedType,
    },
  };
};

export const getUnitGroupProcurementDetails = async (
  user: AuthPayload,
  query: UnitGroupQuery
): Promise<UnitGroupProcurementDetailsResponse> => {
  const unitId = resolveTargetUnitId(user, query.unitId);
  const range = { from: query.dateFrom, to: query.dateTo };
  const now = nowUtc();
  const today = fromBangkokDate(
    toBangkokParts(now).year,
    toBangkokParts(now).month,
    toBangkokParts(now).day
  );

  const unitWhere: Prisma.ProjectWhereInput = {
    responsible_unit_id: unitId,
  };

  const baseWhere = projectRangeWhere(unitWhere, range);

  const [projects, types] = await Promise.all([
    prisma.project.findMany({
      where: baseWhere,
      select: {
        id: true,
        procurement_type: true,
        status: true,
        expected_approval_date: true,
        created_at: true,
        updated_at: true,
      },
    }),
    getUnitProcurementTypes(unitId),
  ]);

  const methods: ProcurementMethodDetailItem[] = [];

  for (const type of types) {
    const typeProjects = projects.filter((p) => p.procurement_type === type);
    const totalCount = typeProjects.length;

    const delayedProjects = typeProjects.filter((p) => {
      const isClosed =
        p.status === ProjectStatus.CLOSED ||
        p.status === ProjectStatus.CANCELLED;
      return (
        !isClosed &&
        p.expected_approval_date &&
        p.expected_approval_date < today
      );
    });

    const delayedCount = delayedProjects.length;
    const delayedPercentage =
      totalCount > 0 ? Math.round((delayedCount / totalCount) * 100) : 0;

    // Status counts
    const statusCounts: Record<string, number> = {
      NOT_STARTED: 0,
      UNASSIGNED: 0,
      WAITING_ACCEPT: 0,
      IN_PROGRESS: 0,
      CLOSED: 0,
      CANCELLED: 0,
    };

    for (const p of typeProjects) {
      if (p.status in statusCounts) {
        statusCounts[p.status] += 1;
      }
    }

    const statusDistribution = [
      {
        status: ProjectStatus.UNASSIGNED,
        count: statusCounts[ProjectStatus.UNASSIGNED],
      },
      {
        status: ProjectStatus.WAITING_ACCEPT,
        count: statusCounts[ProjectStatus.WAITING_ACCEPT],
      },
      {
        status: ProjectStatus.IN_PROGRESS,
        count: statusCounts[ProjectStatus.IN_PROGRESS],
      },
      {
        status: ProjectStatus.CLOSED,
        count: statusCounts[ProjectStatus.CLOSED],
      },
      {
        status: ProjectStatus.CANCELLED,
        count: statusCounts[ProjectStatus.CANCELLED],
      },
    ];

    methods.push({
      procurementType: type,
      delayedCount,
      totalCount,
      delayedPercentage,
      comparisonTrend: 'same',
      statusDistribution,
      avgPhaseDurationDays: {
        procurementPhaseDays: 14,
        contractPhaseDays: 12,
      },
    });
  }

  return {
    unitId,
    mode: query.mode,
    range,
    methods,
  };
};

export const getUnitGroupTopDelayedProjects = async (
  user: AuthPayload,
  query: UnitGroupTopDelayedQuery
): Promise<UnitGroupTopDelayedProjectsResponse> => {
  const TOP_DELAYED_LIMIT = 5;
  const unitId = resolveTargetUnitId(user, query.unitId);
  const now = nowUtc();
  const today = fromBangkokDate(
    toBangkokParts(now).year,
    toBangkokParts(now).month,
    toBangkokParts(now).day
  );

  const unitWhere: Prisma.ProjectWhereInput = {
    responsible_unit_id: unitId,
    status: { notIn: [ProjectStatus.CLOSED, ProjectStatus.CANCELLED] },
    expected_approval_date: { lt: today },
  };

  if (query.procurementType) {
    unitWhere.procurement_type = query.procurementType;
  }

  const projects = await prisma.project.findMany({
    where: unitWhere,
    take: TOP_DELAYED_LIMIT,
    orderBy: { expected_approval_date: 'asc' },
    select: {
      id: true,
      title: true,
      procurement_type: true,
      created_at: true,
      expected_approval_date: true,
    },
  });

  const topProjects: TopDelayedProjectItem[] = projects.map((p) => {
    const totalDays = daysBetweenBangkokDates(
      p.created_at,
      p.expected_approval_date ?? today
    );
    const unitPortion = Math.max(1, Math.floor(totalDays / 5));

    return {
      projectId: p.id,
      title: p.title,
      procurementType: p.procurement_type,
      totalDays: Math.abs(totalDays),
      stageBreakdownDays: {
        taskAssignmentDays: unitPortion,
        procurementPhaseDays: unitPortion * 2,
        contractPhaseDays: unitPortion,
        inspectionApprovalDays: Math.max(1, unitPortion - 1),
        revisionDays: 1,
      },
    };
  });

  return {
    unitId,
    procurementTypeFilter: query.procurementType ?? null,
    projects: topProjects,
  };
};
