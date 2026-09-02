import { ProcurementType, UnitResponsibleType } from '@prisma/client';
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
import { fetchAndFormatUserDetails } from '../auth.service';
import { getOwnProjects, getOwnProjectsTotal } from '../project-query.service';
import { resolveTargetUnitId } from './dashboard.helper';

type CompletedPhase = {
  workflowType: UnitResponsibleType;
  startedAt: Date;
  completedAt: Date;
  assigneeIds: string[];
};

export const getIndividualStaffTodo = async (
  page: number,
  limit: number,
  query: IndividualTodoQuery
): Promise<PaginatedProjects> => {
  const target = await fetchAndFormatUserDetails({
    id: query.targetUserId,
  });

  if (!target) {
    throw new NotFoundError('User not found');
  }

  const targetUser: AuthPayload = {
    token: '',
    id: target.user.id,
    username: target.user.username,
    full_name: target.user.full_name,
    email: target.user.email,
    user_type: target.user.register_type,
    ...target.authData,
  };

  return getOwnProjects(targetUser, page, limit, query);
};

export const getIndividualStaffTodoTotal = async (
  query: IndividualTodoTotalQuery
): Promise<Record<string, number>> => {
  const target = await fetchAndFormatUserDetails({
    id: query.targetUserId,
  });

  if (!target) {
    throw new NotFoundError('User not found');
  }

  const targetUser: AuthPayload = {
    token: '',
    id: target.user.id,
    username: target.user.username,
    full_name: target.user.full_name,
    email: target.user.email,
    user_type: target.user.register_type,
    ...target.authData,
  };

  return getOwnProjectsTotal(targetUser);
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

  const staffProjects = await prisma.project.findMany({
    where: {
      OR: [
        {
          procurement_unit_id: unitId,
          assignee_procurement: { some: { id: staffUser.id } },
        },
        {
          contract_unit_id: unitId,
          assignee_contract: { some: { id: staffUser.id } },
        },
      ],
    },
    select: {
      procurement_type: true,
      procurement_unit_id: true,
      contract_unit_id: true,
      assignee_procurement: { select: { id: true } },
      assignee_contract: { select: { id: true } },
    },
  });

  const staffTypeCounts = new Map<ProcurementType, number>();
  for (const project of staffProjects) {
    if (
      project.procurement_unit_id === unitId &&
      project.assignee_procurement.some(
        (assignee) => assignee.id === staffUser.id
      )
    ) {
      staffTypeCounts.set(
        project.procurement_type,
        (staffTypeCounts.get(project.procurement_type) ?? 0) + 1
      );
    }
    if (
      project.contract_unit_id === unitId &&
      project.assignee_contract.some((assignee) => assignee.id === staffUser.id)
    ) {
      staffTypeCounts.set(
        project.procurement_type,
        (staffTypeCounts.get(project.procurement_type) ?? 0) + 1
      );
    }
  }

  const procurementMethodMetrics = {
    total: [...staffTypeCounts.values()].reduce(
      (total, count) => total + count,
      0
    ),
    byProcurementType: Object.values(ProcurementType).map((type) => ({
      type,
      count: staffTypeCounts.get(type) ?? 0,
    })),
  };

  const completedProjects = await prisma.project.findMany({
    where: {
      OR: [
        {
          procurement_unit_id: unitId,
          procurement_started_at: { not: null },
          procurement_completed_at: { not: null },
        },
        {
          contract_unit_id: unitId,
          contract_started_at: { not: null },
          contract_completed_at: { not: null },
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
