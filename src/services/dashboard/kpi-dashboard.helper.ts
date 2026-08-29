import {
  Prisma,
  ProcurementType,
  ProjectActionType,
  ProjectStatus,
  SubmissionStatus,
  UnitResponsibleType,
  UserRole,
} from '@prisma/client';
import { prisma } from '../../config/prisma';
import {
  bangkokDayStartUtc,
  daysInBangkokMonth,
  fromBangkokDate,
  nowUtc,
  toBangkokParts,
} from '../../utils/date';
import { NotFoundError } from '../../utils/errors';
import {
  countBangkokWorkingDays,
  getBangkokWorkingDayHolidayIndex,
} from '../holiday.service';
import {
  UnitGroupQuery,
  UnitGroupStaffPerformanceQuery,
  UnitGroupTopDelayedQuery,
} from '../../schemas/dashboard.schema';
import { AuthPayload } from '../../types/auth.type';
import {
  ContractUnitSummaryResponse,
  ProcurementMethodDetailItem,
  TopDelayedProjectItem,
  UnitGroupExecutiveSummaryResponse,
  UnitGroupProcurementDetailsResponse,
  UnitGroupProcurementMetricsResponse,
  UnitGroupStaffPerformanceResponse,
  UnitGroupStaffPerformanceRow,
  UnitGroupTopDelayedProjectsResponse,
  WorkloadVsDurationPoint,
} from '../../types/dashboard.type';
import {
  getPreviousRange,
  projectRangeWhere,
  resolveTargetUnitId,
  toComparison,
} from './dashboard.helper';

type StaffPerformancePhase = {
  startedAt: Date;
  completedAt: Date | null;
  assigneeIds: string[];
};

type CompletedDashboardPhase = {
  procurementType: ProcurementType;
  projectCreatedAt: Date;
  startedAt: Date;
  completedAt: Date;
  expectedApprovalDate: Date | null;
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

const isInProgressInRange = (
  startedAt: Date | null,
  completedAt: Date | null,
  range: { from: Date; to: Date }
): startedAt is Date =>
  startedAt !== null &&
  startedAt <= range.to &&
  (completedAt === null || completedAt > range.to);

const isPhaseCompleted = (
  startedAt: Date | null | undefined,
  completedAt: Date | null | undefined
): boolean => Boolean(startedAt && completedAt);

const unitOwnedPhaseWhere = (unitId: string): Prisma.ProjectWhereInput => ({
  OR: [{ procurement_unit_id: unitId }, { contract_unit_id: unitId }],
});

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

  const projectPhaseFilters: Prisma.ProjectWhereInput[] = [
    {
      procurement_unit_id: unitId,
      procurement_started_at: { lte: range.to },
      assignee_procurement: { some: { id: { in: staffIds } } },
    },
    {
      contract_unit_id: unitId,
      contract_started_at: { lte: range.to },
      assignee_contract: { some: { id: { in: staffIds } } },
    },
  ];

  const projects =
    staffIds.length === 0 || projectPhaseFilters.length === 0
      ? []
      : await prisma.project.findMany({
          where: {
            status: { not: ProjectStatus.CANCELLED },
            OR: projectPhaseFilters,
          },
          select: {
            procurement_unit_id: true,
            contract_unit_id: true,
            procurement_started_at: true,
            procurement_completed_at: true,
            contract_started_at: true,
            contract_completed_at: true,
            assignee_procurement: {
              select: {
                id: true,
              },
            },
            assignee_contract: {
              select: {
                id: true,
              },
            },
          },
        });

  const completedPhases: StaffPerformancePhase[] = [];
  const inProgressPhases: StaffPerformancePhase[] = [];
  for (const project of projects) {
    const addPhase = (
      startedAt: Date | null,
      completedAt: Date | null,
      assignees: Array<{ id: string }>
    ) => {
      const assigneeIds = assignees.map((assignee) => assignee.id);
      if (isCompletedInRange(startedAt, completedAt, range)) {
        completedPhases.push({ startedAt, completedAt, assigneeIds });
      } else if (isInProgressInRange(startedAt, completedAt, range)) {
        inProgressPhases.push({ startedAt, completedAt, assigneeIds });
      }
    };

    if (project.procurement_unit_id === unitId) {
      addPhase(
        project.procurement_started_at,
        project.procurement_completed_at,
        project.assignee_procurement
      );
    }
    if (project.contract_unit_id === unitId) {
      addPhase(
        project.contract_started_at,
        project.contract_completed_at,
        project.assignee_contract
      );
    }
  }

  const holidayIndex = await getBangkokWorkingDayHolidayIndex(
    completedPhases.map((phase) => ({
      from: phase.startedAt,
      to: phase.completedAt!,
    }))
  );

  const staffTotals = new Map(
    staff.map((member) => [
      member.id,
      {
        fullName: member.full_name,
        completedProjectCount: 0,
        inProgressProjectCount: 0,
        totalWorkingDays: 0,
      },
    ])
  );

  for (const phase of completedPhases) {
    const duration = countBangkokWorkingDays(
      phase.startedAt,
      phase.completedAt!,
      holidayIndex
    );
    for (const assigneeId of new Set(phase.assigneeIds)) {
      const total = staffTotals.get(assigneeId);
      if (total) {
        total.completedProjectCount++;
        total.totalWorkingDays += duration;
      }
    }
  }

  for (const phase of inProgressPhases) {
    for (const assigneeId of new Set(phase.assigneeIds)) {
      const total = staffTotals.get(assigneeId);
      if (total) {
        total.inProgressProjectCount++;
      }
    }
  }

  const rows: UnitGroupStaffPerformanceRow[] = [...staffTotals.entries()]
    .map(([userId, total]) => ({
      userId,
      fullName: total.fullName,
      projectCount: total.inProgressProjectCount + total.completedProjectCount,
      inProgressProjectCount: total.inProgressProjectCount,
      completedProjectCount: total.completedProjectCount,
      avgWorkingDurationDays:
        total.completedProjectCount === 0
          ? null
          : Math.round(total.totalWorkingDays / total.completedProjectCount),
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

  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
    select: { id: true },
  });
  if (!unit) {
    throw new NotFoundError('Unit not found');
  }

  const where = unitOwnedPhaseWhere(unitId);

  const currentWhere = projectRangeWhere(where, range);
  const previousWhere = projectRangeWhere(where, previousRange);

  const [currentProjects, previousProjects] = await Promise.all([
    prisma.project.findMany({
      where: currentWhere,
      select: {
        procurement_type: true,
        procurement_unit_id: true,
        contract_unit_id: true,
        created_at: true,
        expected_approval_date: true,
        procurement_started_at: true,
        procurement_completed_at: true,
        contract_started_at: true,
        contract_completed_at: true,
      },
    }),
    prisma.project.findMany({
      where: previousWhere,
      select: {
        procurement_type: true,
        procurement_unit_id: true,
        contract_unit_id: true,
        created_at: true,
        expected_approval_date: true,
        procurement_started_at: true,
        procurement_completed_at: true,
        contract_started_at: true,
        contract_completed_at: true,
      },
    }),
  ]);

  const toCompletedPhases = (
    projects: Array<{
      procurement_type: ProcurementType;
      procurement_unit_id: string | null;
      contract_unit_id: string | null;
      created_at: Date;
      expected_approval_date: Date | null;
      procurement_started_at: Date | null;
      procurement_completed_at: Date | null;
      contract_started_at: Date | null;
      contract_completed_at: Date | null;
    }>
  ): CompletedDashboardPhase[] =>
    projects.flatMap((project) => {
      const phases: CompletedDashboardPhase[] = [];
      const basePhase = {
        procurementType: project.procurement_type,
        projectCreatedAt: project.created_at,
        expectedApprovalDate: project.expected_approval_date,
      };

      if (
        project.procurement_unit_id === unitId &&
        isPhaseCompleted(
          project.procurement_started_at,
          project.procurement_completed_at
        )
      ) {
        phases.push({
          ...basePhase,
          startedAt: project.procurement_started_at!,
          completedAt: project.procurement_completed_at!,
        });
      }
      if (
        project.contract_unit_id === unitId &&
        isPhaseCompleted(
          project.contract_started_at,
          project.contract_completed_at
        )
      ) {
        phases.push({
          ...basePhase,
          startedAt: project.contract_started_at!,
          completedAt: project.contract_completed_at!,
        });
      }
      return phases;
    });

  const currentPhases = toCompletedPhases(currentProjects);
  const previousPhases = toCompletedPhases(previousProjects);
  const holidayIndex = await getBangkokWorkingDayHolidayIndex(
    [...currentPhases, ...previousPhases].map((phase) => ({
      from: phase.startedAt,
      to: phase.completedAt,
    }))
  );

  // Longest procurement method
  const methodDurations: Record<string, { totalDays: number; count: number }> =
    {};
  for (const phase of currentPhases) {
    const durationDays = countBangkokWorkingDays(
      phase.startedAt,
      phase.completedAt,
      holidayIndex
    );
    const type = phase.procurementType;
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
  const calcAvgDuration = (phases: CompletedDashboardPhase[]) => {
    if (phases.length === 0) return 0;
    const total = phases.reduce((acc, phase) => {
      return (
        acc +
        countBangkokWorkingDays(
          phase.startedAt,
          phase.completedAt,
          holidayIndex
        )
      );
    }, 0);
    return Math.round(total / phases.length);
  };

  const currAvgDuration = calcAvgDuration(currentPhases);
  const prevAvgDuration = calcAvgDuration(previousPhases);
  const avgDurationComparison = toComparison(currAvgDuration, prevAvgDuration);

  // On-time completion %
  const calcOnTimePct = (phases: CompletedDashboardPhase[]) => {
    if (phases.length === 0) return 100;
    const onTime = phases.filter((phase) => {
      if (!phase.expectedApprovalDate) return true;
      return phase.completedAt <= phase.expectedApprovalDate;
    });
    return Math.round((onTime.length / phases.length) * 100);
  };

  const currOnTime = calcOnTimePct(currentPhases);
  const prevOnTime = calcOnTimePct(previousPhases);
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
    const bucketPhases = currentPhases.filter(
      (phase) =>
        phase.projectCreatedAt >= bucketFrom &&
        phase.projectCreatedAt <= bucketTo
    );
    const avgDur = calcAvgDuration(bucketPhases);

    timelinePoints.push({
      label: `${curY}-${curM.toString().padStart(2, '0')}`,
      from: bucketFrom,
      to: bucketTo,
      workloadCount: bucketPhases.length,
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

  const types = Object.values(ProcurementType);
  const procurementOwnedWhere: Prisma.ProjectWhereInput = {
    procurement_unit_id: unitId,
  };

  const delayedWhere: Prisma.ProjectWhereInput = {
    status: { not: ProjectStatus.CANCELLED },
    expected_approval_date: { not: null },
    OR: [
      {
        procurement_completed_at: { not: null },
        expected_approval_date: {
          lt: prisma.project.fields.procurement_completed_at,
        },
      },
      {
        procurement_completed_at: null,
        expected_approval_date: { lt: today },
      },
    ],
  };

  const [byTotalType, byDelayedType] = await Promise.all([
    prisma.$transaction(
      types.map((type) =>
        prisma.project.count({
          where: projectRangeWhere(
            { ...procurementOwnedWhere, procurement_type: type },
            range
          ),
        })
      )
    ),
    prisma.$transaction(
      types.map((type) =>
        prisma.project.count({
          where: {
            AND: [
              projectRangeWhere(
                { ...procurementOwnedWhere, procurement_type: type },
                range
              ),
              delayedWhere,
            ],
          },
        })
      )
    ),
  ]);

  const totalByProcurementType = types.map((type, index) => ({
    type,
    count: byTotalType[index],
  }));
  const delayedByProcurementType = types.map((type, index) => ({
    type,
    count: byDelayedType[index],
  }));

  const total = totalByProcurementType.reduce(
    (sum, item) => sum + item.count,
    0
  );
  const delayedTotal = delayedByProcurementType.reduce(
    (sum, item) => sum + item.count,
    0
  );

  return {
    unitId,
    totalProjects: {
      total,
      byProcurementType: totalByProcurementType,
    },
    delayedProjects: {
      total: delayedTotal,
      byProcurementType: delayedByProcurementType,
    },
  };
};

export const getUnitGroupProcurementDetails = async (
  user: AuthPayload,
  query: UnitGroupQuery
): Promise<UnitGroupProcurementDetailsResponse> => {
  const unitId = resolveTargetUnitId(user, query.unitId);
  const range = { from: query.dateFrom, to: query.dateTo };
  const previousRange = getPreviousRange(range, query.mode);
  const now = nowUtc();
  const today = fromBangkokDate(
    toBangkokParts(now).year,
    toBangkokParts(now).month,
    toBangkokParts(now).day
  );

  const types = Object.values(ProcurementType);
  const procurementOwnedWhere: Prisma.ProjectWhereInput = {
    procurement_unit_id: unitId,
  };

  const baseWhere = projectRangeWhere(procurementOwnedWhere, range);
  const previousWhere = projectRangeWhere(procurementOwnedWhere, previousRange);

  const [projects, previousProjects] = await Promise.all([
    prisma.project.findMany({
      where: baseWhere,
      select: {
        id: true,
        procurement_type: true,
        procurement_unit_id: true,
        contract_unit_id: true,
        status: true,
        expected_approval_date: true,
        created_at: true,
        updated_at: true,
        procurement_started_at: true,
        procurement_completed_at: true,
        contract_started_at: true,
        contract_completed_at: true,
      },
    }),
    prisma.project.findMany({
      where: previousWhere,
      select: {
        procurement_type: true,
        status: true,
        expected_approval_date: true,
        procurement_started_at: true,
        procurement_completed_at: true,
      },
    }),
  ]);

  const completedPhaseRanges = projects.flatMap((project) => {
    const ranges: Array<{ from: Date; to: Date }> = [];
    if (project.procurement_started_at && project.procurement_completed_at) {
      ranges.push({
        from: project.procurement_started_at,
        to: project.procurement_completed_at,
      });
    }
    if (
      project.contract_unit_id === unitId &&
      project.contract_started_at &&
      project.contract_completed_at
    ) {
      ranges.push({
        from: project.contract_started_at,
        to: project.contract_completed_at,
      });
    }
    return ranges;
  });
  const holidayIndex =
    await getBangkokWorkingDayHolidayIndex(completedPhaseRanges);
  const averagePhaseDuration = (
    phases: Array<{ startedAt: Date; completedAt: Date }>
  ): number => {
    if (phases.length === 0) return 0;
    const total = phases.reduce(
      (sum, phase) =>
        sum +
        countBangkokWorkingDays(
          phase.startedAt,
          phase.completedAt,
          holidayIndex
        ),
      0
    );
    return Number((total / phases.length).toFixed(1));
  };

  const methods: ProcurementMethodDetailItem[] = [];

  const isDelayed = (project: {
    status: ProjectStatus;
    expected_approval_date: Date | null;
    procurement_started_at: Date | null;
    procurement_completed_at: Date | null;
  }): boolean =>
    project.status !== ProjectStatus.CANCELLED &&
    project.expected_approval_date !== null &&
    (project.expected_approval_date < today ||
      project.expected_approval_date < project.procurement_completed_at);

  const delayedPercentage = (
    methodProjects: Array<{
      status: ProjectStatus;
      expected_approval_date: Date | null;
      procurement_started_at: Date | null;
      procurement_completed_at: Date | null;
    }>
  ): number =>
    methodProjects.length === 0
      ? 0
      : Math.round(
          (methodProjects.filter(isDelayed).length / methodProjects.length) *
            100
        );

  for (const type of types) {
    const typeProjects = projects.filter((p) => p.procurement_type === type);
    const totalCount = typeProjects.length;
    const delayedCount = typeProjects.filter(isDelayed).length;
    const currentDelayedPercentage = delayedPercentage(typeProjects);
    const previousDelayedPercentage = delayedPercentage(
      previousProjects.filter((project) => project.procurement_type === type)
    );
    const procurementPhases = typeProjects.flatMap((project) =>
      project.procurement_started_at && project.procurement_completed_at
        ? [
            {
              startedAt: project.procurement_started_at,
              completedAt: project.procurement_completed_at,
            },
          ]
        : []
    );
    const contractPhases = typeProjects.flatMap((project) =>
      project.contract_started_at &&
      project.contract_completed_at &&
      project.contract_unit_id === unitId
        ? [
            {
              startedAt: project.contract_started_at,
              completedAt: project.contract_completed_at,
            },
          ]
        : []
    );

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
      delayedPercentage: currentDelayedPercentage,
      comparisonTrend: toComparison(
        currentDelayedPercentage,
        previousDelayedPercentage
      ).trend,
      statusDistribution,
      avgPhaseDurationDays: {
        procurementPhaseDays: averagePhaseDuration(procurementPhases),
        contractPhaseDays: averagePhaseDuration(contractPhases),
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

  const where: Prisma.ProjectWhereInput = {
    status: { not: ProjectStatus.CANCELLED },
    ...unitOwnedPhaseWhere(unitId),
  };

  if (query.procurementType) {
    where.procurement_type = query.procurementType;
  }

  const projects = await prisma.project.findMany({
    where,
    select: {
      id: true,
      title: true,
      status: true,
      procurement_type: true,
      procurement_unit_id: true,
      contract_unit_id: true,
      created_at: true,
      procurement_started_at: true,
      procurement_completed_at: true,
      contract_started_at: true,
      contract_completed_at: true,
      project_histories: {
        where: {
          action: ProjectActionType.STATUS_UPDATE,
          new_value: {
            path: ['status'],
            equals: ProjectStatus.CLOSED,
          },
        },
        select: {
          changed_at: true,
        },
        orderBy: { changed_at: 'desc' },
        take: 1,
      },
      submissions: {
        select: {
          workflow_type: true,
          status: true,
          submitted_at: true,
          approved_at: true,
          completed_at: true,
        },
        orderBy: { submitted_at: 'asc' },
      },
    },
  });

  const holidayIndex = await getBangkokWorkingDayHolidayIndex(
    projects.map((project) => ({
      from: project.created_at,
      to: today,
    }))
  );

  type SubmissionApprovalInterval = { from: Date; to: Date };
  const approvalEndDate = (submission: {
    status: SubmissionStatus;
    submitted_at: Date;
    approved_at: Date | null;
    completed_at: Date | null;
  }): Date => {
    if (submission.completed_at) return submission.completed_at;
    if (submission.status === SubmissionStatus.COMPLETED) {
      return submission.submitted_at;
    }
    if (submission.status === SubmissionStatus.REJECTED) {
      return submission.approved_at ?? submission.submitted_at;
    }
    return today;
  };

  const countApprovalDays = (
    submissions: Array<{
      workflow_type: UnitResponsibleType;
      status: SubmissionStatus;
      submitted_at: Date;
      approved_at: Date | null;
      completed_at: Date | null;
    }>,
    workflowType: UnitResponsibleType | ProcurementType,
    phaseRange?: SubmissionApprovalInterval
  ): number => {
    if (!phaseRange) return 0;

    const intervals = submissions
      .filter((submission) => submission.workflow_type === workflowType)
      .map((submission) => ({
        from:
          bangkokDayStartUtc(submission.submitted_at) > phaseRange.from
            ? bangkokDayStartUtc(submission.submitted_at)
            : phaseRange.from,
        to:
          bangkokDayStartUtc(approvalEndDate(submission)) < phaseRange.to
            ? bangkokDayStartUtc(approvalEndDate(submission))
            : phaseRange.to,
      }))
      .filter((interval) => interval.from < interval.to)
      .sort((left, right) => left.from.getTime() - right.from.getTime());

    const merged: SubmissionApprovalInterval[] = [];
    for (const interval of intervals) {
      const current = merged.at(-1);
      if (!current || interval.from > current.to) {
        merged.push({ ...interval });
      } else if (interval.to > current.to) {
        current.to = interval.to;
      }
    }

    return merged.reduce(
      (total, interval) =>
        total +
        countBangkokWorkingDays(interval.from, interval.to, holidayIndex),
      0
    );
  };

  const calculatedProjects: TopDelayedProjectItem[] = projects.flatMap((p) => {
    const items: TopDelayedProjectItem[] = [];
    if (p.contract_unit_id === unitId) {
      const procurementComplete = p.procurement_completed_at!;
      const contractStart = p.contract_started_at ?? today;
      const contractEnd = p.contract_completed_at ?? today;
      const closedHistoryAt = p.project_histories?.[0]?.changed_at;
      const projectClosed =
        p.status === ProjectStatus.CLOSED ? closedHistoryAt! : today;

      const contractRange = {
        from: bangkokDayStartUtc(contractStart),
        to: bangkokDayStartUtc(contractEnd),
      };

      const approvalDays = countApprovalDays(
        p.submissions ?? [],
        UnitResponsibleType.CONTRACT,
        contractRange
      );

      const totalDays = countBangkokWorkingDays(
        procurementComplete,
        p.contract_completed_at ? contractEnd : projectClosed,
        holidayIndex
      );
      const contractStageDays = countBangkokWorkingDays(
        contractRange.from,
        contractRange.to,
        holidayIndex
      );

      const financeDays = p.contract_completed_at
        ? countBangkokWorkingDays(contractEnd, projectClosed, holidayIndex)
        : 0;

      const contractWorkingDays = Math.max(0, contractStageDays - approvalDays);
      const assignmentDays = p.contract_started_at
        ? countBangkokWorkingDays(
            procurementComplete,
            p.contract_started_at,
            holidayIndex
          )
        : 0;

      items.push({
        projectId: p.id,
        title: p.title,
        procurementType: p.procurement_type,
        workflowType: UnitResponsibleType.CONTRACT,
        totalDays,
        stageBreakdownDays: {
          assignmentDays,
          procurementDays: 0,
          contractDays: contractWorkingDays,
          approvalDays,
          financeDays,
        },
      });
    }

    if (p.procurement_unit_id === unitId) {
      const startAt = p.created_at;
      const procurementEnd = p.procurement_completed_at ?? today;

      const totalDays = countBangkokWorkingDays(
        startAt,
        procurementEnd,
        holidayIndex
      );

      const procurementStarted =
        p.procurement_started_at && p.procurement_started_at < procurementEnd
          ? p.procurement_started_at
          : procurementEnd;

      const assignmentDays = countBangkokWorkingDays(
        startAt,
        procurementStarted,
        holidayIndex
      );

      const procurementRange = {
        from: bangkokDayStartUtc(procurementStarted),
        to: bangkokDayStartUtc(procurementEnd),
      };

      const approvalDays = countApprovalDays(
        p.submissions ?? [],
        p.procurement_type,
        procurementRange
      );

      const procurementStageDays = countBangkokWorkingDays(
        procurementRange.from,
        procurementRange.to,
        holidayIndex
      );

      const procurementDays = Math.max(0, procurementStageDays - approvalDays);

      items.push({
        projectId: p.id,
        title: p.title,
        procurementType: p.procurement_type,
        workflowType: p.procurement_type as UnitResponsibleType,
        totalDays,
        stageBreakdownDays: {
          assignmentDays,
          procurementDays,
          contractDays: 0,
          approvalDays,
          financeDays: 0,
        },
      });
    }

    return items;
  });

  calculatedProjects.sort((a, b) => b.totalDays - a.totalDays);
  const topProjects = calculatedProjects.slice(0, TOP_DELAYED_LIMIT);

  return {
    unitId,
    procurementTypeFilter: query.procurementType,
    projects: topProjects,
  };
};

export const getContractUnitSummary = async (
  user: AuthPayload,
  query: UnitGroupQuery
): Promise<ContractUnitSummaryResponse> => {
  const unitId = resolveTargetUnitId(user, query.unitId);
  const range = { from: query.dateFrom, to: query.dateTo };

  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
    select: { id: true },
  });

  if (!unit) {
    throw new NotFoundError('Unit not found');
  }

  const statusCounts = await prisma.project.groupBy({
    by: ['status'],
    where: {
      contract_unit_id: unitId,
      created_at: { gte: range.from, lte: range.to },
    },
    _count: {
      _all: true,
    },
  });

  const countMap = new Map<ProjectStatus, number>(
    statusCounts.map((sc) => [sc.status, sc._count._all])
  );

  const unassigned = countMap.get(ProjectStatus.UNASSIGNED) ?? 0;
  const waitingAccept = countMap.get(ProjectStatus.WAITING_ACCEPT) ?? 0;
  const inProgress =
    (countMap.get(ProjectStatus.IN_PROGRESS) ?? 0) +
    (countMap.get(ProjectStatus.WAITING_CANCEL) ?? 0) +
    (countMap.get(ProjectStatus.WAITING_CLOSE) ?? 0);
  const completed = countMap.get(ProjectStatus.CLOSED) ?? 0;
  const cancelled = countMap.get(ProjectStatus.CANCELLED) ?? 0;

  const contractProjects = await prisma.project.findMany({
    where: {
      contract_unit_id: unitId,
      created_at: { gte: range.from, lte: range.to },
    },
    select: {
      contract_started_at: true,
      contract_completed_at: true,
    },
  });

  const completedContractProjects = contractProjects.filter((project) =>
    isPhaseCompleted(project.contract_started_at, project.contract_completed_at)
  );
  const inProgressContractProjects = contractProjects.filter(
    (project) =>
      project.contract_started_at !== null &&
      !isPhaseCompleted(
        project.contract_started_at,
        project.contract_completed_at
      )
  );

  const holidayIndex = await getBangkokWorkingDayHolidayIndex(
    completedContractProjects.map((project) => ({
      from: project.contract_started_at!,
      to: project.contract_completed_at!,
    }))
  );
  const totalDurationDays = completedContractProjects.reduce(
    (total, project) =>
      total +
      countBangkokWorkingDays(
        project.contract_started_at!,
        project.contract_completed_at!,
        holidayIndex
      ),
    0
  );
  const avgContractDurationDays =
    completedContractProjects.length === 0
      ? 0
      : Number(
          (totalDurationDays / completedContractProjects.length).toFixed(1)
        );

  return {
    unitId,
    mode: query.mode,
    range,
    statusBreakdown: {
      unassigned,
      waitingAccept,
      inProgress,
      completed,
      cancelled,
    },
    phaseWorkload: {
      inProgress: inProgressContractProjects.length,
      completed: completedContractProjects.length,
    },
    avgContractDurationDays,
  };
};
