import {
  Prisma,
  ProcurementType,
  Project,
  ProjectStatus,
  UnitResponsibleType,
} from '@prisma/client';
import { prisma } from '../../config/prisma';
import { NotFoundError } from '../../utils/errors';
import {
  countBangkokWorkingDays,
  getBangkokWorkingDayHolidayIndex,
} from '../holiday.service';
import {
  IndividualDashboardQuery,
  IndividualTodoQuery,
  IndividualTodoTotalQuery,
} from '../../schemas/dashboard.schema';
import { AuthPayload } from '../../types/auth.type';
import { PaginatedProjects } from '../../types/project.type';
import {
  DurationComparisonItem,
  IndividualDashboardResponse,
} from '../../types/dashboard.type';
import { resolveTargetUnitId } from './dashboard.helper';

type CompletedPhase = {
  workflowType: UnitResponsibleType;
  startedAt: Date;
  completedAt: Date;
  assigneeIds: string[];
};

const getWhere = (query: IndividualTodoQuery) => {
  const { tab, dateFrom, dateTo, targetUserId } = query;
  switch (tab) {
    case 'ALL':
      return {
        created_at: {
          gte: dateFrom,
          lte: dateTo,
        },
        status: {
          in: [
            ProjectStatus.WAITING_ACCEPT,
            ProjectStatus.REVIEW_TOR,
            ProjectStatus.IN_PROGRESS,
            ProjectStatus.WAITING_CLOSE,
            ProjectStatus.CLOSED,
          ],
        },
        OR: [
          {
            assignee_procurement: { some: { id: targetUserId } },
          },
          {
            assignee_contract: { some: { id: targetUserId } },
          },
        ],
      };
    case 'IN_PROGRESS':
      return {
        created_at: {
          gte: dateFrom,
          lte: dateTo,
        },
        status: {
          in: [
            ProjectStatus.WAITING_ACCEPT,
            ProjectStatus.REVIEW_TOR,
            ProjectStatus.IN_PROGRESS,
          ],
        },
        OR: [
          {
            assignee_procurement: { some: { id: targetUserId } },
          },
          {
            assignee_contract: { some: { id: targetUserId } },
          },
        ],
      };
    case 'COMPLETED':
      return {
        created_at: {
          gte: dateFrom,
          lte: dateTo,
        },
        current_workflow_type: UnitResponsibleType.CONTRACT,
        OR: [
          {
            assignee_procurement: { some: { id: targetUserId } },
            assignee_contract: { none: { id: targetUserId } },
          },
          {
            status: {
              in: [ProjectStatus.WAITING_CLOSE, ProjectStatus.CLOSED],
            },
            assignee_contract: { some: { id: targetUserId } },
          },
        ],
      };
    default:
      throw new NotFoundError('Invalid tab');
  }
};

export const getIndividualStaffTodo = async (
  page: number,
  limit: number,
  query: IndividualTodoQuery
): Promise<PaginatedProjects> => {
  let projects: Partial<Project>[] = [],
    count = 0;

  const select = {
    id: true,
    receive_no: true,
    title: true,
    status: true,
    assignee_procurement: {
      select: {
        id: true,
        full_name: true,
      },
    },
    assignee_contract: {
      select: {
        id: true,
        full_name: true,
      },
    },
    contract_no: true,
    expected_approval_date: true,
    procurement_type: true,
    requesting_dept: {
      select: {
        id: true,
        name: true,
      },
    },
    requesting_unit: {
      select: {
        id: true,
        name: true,
      },
    },
  };

  switch (query.tab) {
    case 'ALL':
      [projects, count] = await Promise.all([
        prisma.project.findMany({
          skip: (page - 1) * limit,
          take: limit,
          select,
          where: getWhere(query),
          orderBy: {
            receive_no: 'desc',
          },
        }),
        prisma.project.count({
          where: getWhere(query),
        }),
      ]);
      break;
    case 'IN_PROGRESS':
      [projects, count] = await Promise.all([
        prisma.project.findMany({
          skip: (page - 1) * limit,
          take: limit,
          select,
          where: getWhere(query),
          orderBy: {
            receive_no: 'desc',
          },
        }),
        prisma.project.count({
          where: getWhere(query),
        }),
      ]);
      break;
    case 'COMPLETED':
      [projects, count] = await Promise.all([
        prisma.project.findMany({
          skip: (page - 1) * limit,
          take: limit,
          select,
          where: getWhere(query),
          orderBy: {
            receive_no: 'desc',
          },
        }),
        prisma.project.count({
          where: getWhere(query),
        }),
      ]);
      break;
    default:
      throw new NotFoundError('Invalid tab');
  }

  return {
    total: count,
    page,
    pageSize: limit,
    totalPages: Math.ceil(count / limit),
    data: projects,
  };
};

export const getIndividualStaffTodoTotal = async (
  query: IndividualTodoTotalQuery
): Promise<Record<string, number>> => {
  const [allCount, inProgressCount, completedCount] = await Promise.all([
    prisma.project.count({
      where: getWhere({ tab: 'ALL', ...query }),
    }),
    prisma.project.count({
      where: getWhere({ tab: 'IN_PROGRESS', ...query }),
    }),
    prisma.project.count({
      where: getWhere({ tab: 'COMPLETED', ...query }),
    }),
  ]);

  return {
    ALL: allCount,
    IN_PROGRESS: inProgressCount,
    COMPLETED: completedCount,
  };
};

export const getIndividualStaffDashboard = async (
  user: AuthPayload,
  query: IndividualDashboardQuery
): Promise<IndividualDashboardResponse> => {
  const unitId = resolveTargetUnitId(user, query.unitId);

  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
    select: { id: true },
  });
  if (!unit) {
    throw new NotFoundError('Unit not found');
  }

  const staffUser = await prisma.user.findFirst({
    where: {
      id: query.targetUserId,
      roles: {
        some: {
          unit_id: unitId,
        },
      },
    },
    select: {
      id: true,
      full_name: true,
    },
  });

  if (!staffUser) {
    throw new NotFoundError('Staff user not found in this unit');
  }

  const dateFrom = query.dateFrom;
  const dateTo = query.dateTo;
  const range = dateFrom && dateTo ? { from: dateFrom, to: dateTo } : undefined;

  const procurementPhaseFilter: Prisma.ProjectWhereInput = {
    procurement_unit_id: unitId,
    assignee_procurement: { some: { id: staffUser.id } },
  };

  const contractPhaseFilter: Prisma.ProjectWhereInput = {
    contract_unit_id: unitId,
    assignee_contract: { some: { id: staffUser.id } },
  };

  const staffProjects = await prisma.project.findMany({
    where: {
      status: { not: ProjectStatus.CANCELLED },
      OR: [procurementPhaseFilter, contractPhaseFilter],
    },
    select: {
      procurement_type: true,
      procurement_unit_id: true,
      contract_unit_id: true,
      procurement_started_at: true,
      procurement_completed_at: true,
      contract_started_at: true,
      contract_completed_at: true,
      assignee_procurement: { select: { id: true } },
      assignee_contract: { select: { id: true } },
    },
  });

  const procurementMethodMetrics = {
    total: staffProjects.length,
    byProcurementType: Object.values(ProcurementType).map((type) => ({
      type,
      count: staffProjects.filter(
        (project) => project.procurement_type === type
      ).length,
    })),
  };

  const completedProjects = await prisma.project.findMany({
    where: {
      status: { not: ProjectStatus.CANCELLED },
      OR: [
        {
          procurement_unit_id: unitId,
          procurement_started_at: { not: null },
          procurement_completed_at: range
            ? { gte: range.from, lte: range.to }
            : { not: null },
        },
        {
          contract_unit_id: unitId,
          contract_started_at: { not: null },
          contract_completed_at: range
            ? { gte: range.from, lte: range.to }
            : { not: null },
        },
      ],
    },
    select: {
      procurement_type: true,
      procurement_unit_id: true,
      contract_unit_id: true,
      procurement_started_at: true,
      procurement_completed_at: true,
      contract_started_at: true,
      contract_completed_at: true,
      assignee_procurement: { select: { id: true } },
      assignee_contract: { select: { id: true } },
    },
  });

  const completedPhases: CompletedPhase[] = [];
  for (const project of completedProjects) {
    if (
      project.procurement_unit_id === unitId &&
      project.procurement_started_at &&
      project.procurement_completed_at
    ) {
      completedPhases.push({
        workflowType: project.procurement_type as UnitResponsibleType,
        startedAt: project.procurement_started_at,
        completedAt: project.procurement_completed_at,
        assigneeIds: project.assignee_procurement.map(
          (assignee) => assignee.id
        ),
      });
    }

    if (
      project.contract_unit_id === unitId &&
      project.contract_started_at &&
      project.contract_completed_at
    ) {
      completedPhases.push({
        workflowType: UnitResponsibleType.CONTRACT,
        startedAt: project.contract_started_at,
        completedAt: project.contract_completed_at,
        assigneeIds: project.assignee_contract.map((assignee) => assignee.id),
      });
    }
  }

  const holidayIndex = await getBangkokWorkingDayHolidayIndex(
    completedPhases.map((phase) => ({
      from: phase.startedAt,
      to: phase.completedAt,
    }))
  );

  const workflowTypes = new Set(
    completedPhases.map((phase) => phase.workflowType)
  );
  const averageDurationDays = (phases: CompletedPhase[]) => {
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

  const durationComparison: DurationComparisonItem[] = Object.values(
    UnitResponsibleType
  )
    .filter((workflowType) => workflowTypes.has(workflowType))
    .map((workflowType) => {
      const typePhases = completedPhases.filter(
        (phase) => phase.workflowType === workflowType
      );
      const staffPhases = typePhases.filter((phase) =>
        phase.assigneeIds.includes(staffUser.id)
      );
      const staffAvgDurationDays = averageDurationDays(staffPhases);
      const unitAvgDurationDays = averageDurationDays(typePhases);
      const comparison =
        staffAvgDurationDays > unitAvgDurationDays
          ? 'worse'
          : staffAvgDurationDays < unitAvgDurationDays
            ? 'better'
            : 'same';

      return {
        workflowType,
        staffAvgDurationDays,
        unitAvgDurationDays,
        comparison,
      };
    });

  return {
    unitId,
    user: {
      id: staffUser.id,
      fullName: staffUser.full_name,
    },
    durationComparison,
    procurementMethodMetrics,
  };
};
