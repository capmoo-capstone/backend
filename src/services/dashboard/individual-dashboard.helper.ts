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
import { getUnitProcurementTypes } from './kpi-dashboard.helper';

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
    select: { id: true, type: true },
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

  const procurementTypes = await getUnitProcurementTypes(unitId);
  let procurementMethodMetrics: {
    total: number;
    byProcurementType: Array<{ type: ProcurementType; count: number }>;
  } | null = null;
  // 1. Donut Chart Breakdown (procurementMethodMetrics)
  if (procurementTypes.length !== 0) {
    const staffProjects = await prisma.project.findMany({
      where: {
        responsible_unit_id: unitId,
        OR: [
          { assignee_procurement: { some: { id: staffUser.id } } },
          { assignee_contract: { some: { id: staffUser.id } } },
        ],
      },
      select: {
        procurement_type: true,
      },
    });

    const staffTypeCounts = new Map<ProcurementType, number>();
    for (const p of staffProjects) {
      const current = staffTypeCounts.get(p.procurement_type) ?? 0;
      staffTypeCounts.set(p.procurement_type, current + 1);
    }

    const byProcurementType = procurementTypes.map((type) => ({
      type,
      count: staffTypeCounts.get(type) ?? 0,
    }));

    const total = staffProjects.length;

    procurementMethodMetrics = {
      total,
      byProcurementType,
    };
  }

  // 2. Two-Phase Duration Comparison (durationComparison)
  const completedProjects = await prisma.project.findMany({
    where: {
      responsible_unit_id: unitId,
      OR: [
        {
          procurement_started_at: { not: null },
          procurement_completed_at: { not: null },
        },
        {
          contract_started_at: { not: null },
          contract_completed_at: { not: null },
        },
      ],
    },
    select: {
      procurement_type: true,
      procurement_started_at: true,
      procurement_completed_at: true,
      contract_started_at: true,
      contract_completed_at: true,
      assignee_procurement: {
        select: {
          id: true,
          roles: {
            where: { unit_id: unitId },
            select: { unit_id: true },
          },
        },
      },
      assignee_contract: {
        select: {
          id: true,
          roles: {
            where: { unit_id: unitId },
            select: { unit_id: true },
          },
        },
      },
    },
  });

  type CompletedPhase = {
    workflowType: UnitResponsibleType;
    startedAt: Date;
    completedAt: Date;
    assigneeIds: string[];
  };

  const hasUnitAssignee = (
    assignees?: Array<{ roles?: Array<{ unit_id: string | null }> }>
  ): boolean => {
    if (assignees === undefined) return true;
    if (assignees.length === 0) return false;
    return assignees.some(
      (assignee) =>
        assignee.roles === undefined ||
        assignee.roles.some((role) => role.unit_id !== null)
    );
  };

  const completedPhases: CompletedPhase[] = [];
  for (const project of completedProjects) {
    if (
      project.procurement_started_at &&
      project.procurement_completed_at &&
      hasUnitAssignee(project.assignee_procurement)
    ) {
      completedPhases.push({
        workflowType: project.procurement_type,
        startedAt: project.procurement_started_at,
        completedAt: project.procurement_completed_at,
        assigneeIds: project.assignee_procurement.map((a) => a.id),
      });
    }

    if (
      project.contract_started_at &&
      project.contract_completed_at &&
      hasUnitAssignee(project.assignee_contract)
    ) {
      completedPhases.push({
        workflowType: UnitResponsibleType.CONTRACT,
        startedAt: project.contract_started_at,
        completedAt: project.contract_completed_at,
        assigneeIds: project.assignee_contract.map((a) => a.id),
      });
    }
  }

  const holidayIndex = await getBangkokWorkingDayHolidayIndex(
    completedPhases.map((phase) => ({
      from: phase.startedAt,
      to: phase.completedAt,
    }))
  );

  const durationComparison: DurationComparisonItem[] = unit.type.map((type) => {
    const typePhases = completedPhases.filter(
      (phase) => phase.workflowType === type
    );
    const staffPhases = typePhases.filter((phase) =>
      phase.assigneeIds.includes(staffUser.id)
    );

    let staffTotalDays = 0;
    for (const phase of staffPhases) {
      staffTotalDays += countBangkokWorkingDays(
        phase.startedAt,
        phase.completedAt,
        holidayIndex
      );
    }
    const staffAvgDurationDays =
      staffPhases.length > 0
        ? Number((staffTotalDays / staffPhases.length).toFixed(1))
        : 0;

    let unitTotalDays = 0;
    for (const phase of typePhases) {
      unitTotalDays += countBangkokWorkingDays(
        phase.startedAt,
        phase.completedAt,
        holidayIndex
      );
    }
    const unitAvgDurationDays =
      typePhases.length > 0
        ? Number((unitTotalDays / typePhases.length).toFixed(1))
        : 0;

    let comparison: 'better' | 'worse' | 'same' = 'same';
    if (staffAvgDurationDays > unitAvgDurationDays) {
      comparison = 'worse';
    } else if (staffAvgDurationDays < unitAvgDurationDays) {
      comparison = 'better';
    }

    return {
      workflowType: type,
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
