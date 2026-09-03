import {
  Prisma,
  ProjectStatus,
  ProjectActionType,
  AuditLogType,
  AuditEventType,
  AuditTargetType,
} from '@prisma/client';
import { prisma } from '../config/prisma';
import { NotFoundError, BadRequestError, AppError } from '../utils/errors';
import { getProcurementTypeToUnitIdMap } from '../utils/unit-type';
import { AuthPayload } from '../types/auth.type';
import { CreateProjectDto, UpdateProjectDto } from '../schemas/project.schema';
import {
  CreateProjectResponse,
  ProjectsListResponse,
  UpdateProjectDataResponse,
} from '../types/project.type';
import {
  createProjectHistoryAndAuditEvent,
  recordAuditEvent,
  buildContractNumberTargetSnapshot,
} from './audit-log.service';
import { nowUtc, toBangkokParts } from '../utils/date';
import { assertInstallmentRoundsCanBeUpdated } from '../utils/project-installment';
import { Capability, assertCapability } from '../utils/access-policy';
import { activeContractNumberWhere } from '../utils/active-state';
import { assertProjectCanBeDeleted } from '../utils/deletion-policy';

const currentBangkokBudgetYear = (): number => {
  const parts = toBangkokParts(nowUtc());
  const buddhistYear = parts.year + 543;
  return parts.month >= 10 ? buddhistYear + 1 : buddhistYear;
};

const acquireProjectCreationLock = async (tx: Prisma.TransactionClient) => {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('project_creation_lock'))`;
};

const getReceiveNumberSync = async (
  tx: Prisma.TransactionClient,
  budget_year?: number,
  buffer = 0
): Promise<string> => {
  if (!budget_year) {
    budget_year = currentBangkokBudgetYear();
  }
  const count = await tx.project.count({
    where: {
      receive_no: {
        startsWith: budget_year.toString(),
      },
    },
  });

  return budget_year
    .toString()
    .concat('/')
    .concat((count + 1 + buffer).toString().padStart(5, '0'));
};

export const checkRefNumberDuplication = async (
  tx: Prisma.TransactionClient,
  pr_no: string[] = [],
  less_no: string[] = [],
  po_no: string[] = [],
  migo_103_no: string[] = [],
  migo_105_no: string[] = [],
  excludeProjectId?: string
) => {
  if (
    pr_no.length === 0 &&
    less_no.length === 0 &&
    po_no.length === 0 &&
    migo_103_no.length === 0 &&
    migo_105_no.length === 0
  )
    return;
  // For Import Projects
  if (pr_no.length > 1 && new Set(pr_no).size !== pr_no.length) {
    throw new BadRequestError('Duplicate PR numbers in request');
  }
  if (less_no.length > 1 && new Set(less_no).size !== less_no.length) {
    throw new BadRequestError('Duplicate LESS numbers in request');
  }

  const whereClause: any = {
    OR: [],
  };
  if (pr_no.length > 0) {
    whereClause.OR.push({ pr_no: { in: pr_no } });
  }
  if (less_no.length > 0) {
    whereClause.OR.push({ less_no: { in: less_no } });
  }
  if (po_no.length > 0) {
    whereClause.OR.push({ po_no: { in: po_no } });
  }
  if (migo_103_no.length > 0) {
    whereClause.OR.push({ migo_103_no: { in: migo_103_no } });
  }
  if (migo_105_no.length > 0) {
    whereClause.OR.push({ migo_105_no: { in: migo_105_no } });
  }
  if (excludeProjectId) {
    whereClause.NOT = { id: excludeProjectId };
  }

  const existing = await tx.project.findFirst({
    where: whereClause,
    select: {
      id: true,
      pr_no: true,
      less_no: true,
      po_no: true,
      migo_103_no: true,
      migo_105_no: true,
    },
  });
  if (existing) {
    if (existing.pr_no && pr_no.includes(existing.pr_no)) {
      throw new AppError(`Duplicate PR number: ${existing.pr_no}`, 409);
    }
    if (existing.less_no && less_no.includes(existing.less_no)) {
      throw new AppError(`Duplicate LESS number: ${existing.less_no}`, 409);
    }
    if (existing.po_no && po_no.includes(existing.po_no)) {
      throw new AppError(`Duplicate PO number: ${existing.po_no}`, 409);
    }
    if (existing.migo_103_no && migo_103_no.includes(existing.migo_103_no)) {
      throw new AppError(
        `Duplicate MIGO 103 number: ${existing.migo_103_no}`,
        409
      );
    }
    if (existing.migo_105_no && migo_105_no.includes(existing.migo_105_no)) {
      throw new AppError(
        `Duplicate MIGO 105 number: ${existing.migo_105_no}`,
        409
      );
    }
  }
};

export const createProject = async (
  user: AuthPayload,
  data: CreateProjectDto
): Promise<CreateProjectResponse> => {
  assertCapability(user, Capability.PROJECT_CREATE);
  return await prisma.$transaction(async (tx) => {
    await acquireProjectCreationLock(tx);

    await checkRefNumberDuplication(
      tx,
      data.pr_no ? [data.pr_no] : [],
      data.less_no ? [data.less_no] : [],
      data.po_no ? [data.po_no] : []
    );

    if (data.budget_plan_id && data.budget_plan_id.length > 0) {
      const budgetPlans = await tx.budgetPlan.findMany({
        where: { id: { in: data.budget_plan_id } },
        select: { id: true },
      });
      if (budgetPlans.length !== data.budget_plan_id.length) {
        throw new NotFoundError('One or more budget plans not found');
      }
    }

    const receiveNumber = await getReceiveNumberSync(tx, data.budget_year);

    const unitType = await getProcurementTypeToUnitIdMap(tx);
    if (unitType.get(data.procurement_type) == null) {
      throw new NotFoundError(
        `Responsible unit not found for procurement type ${data.procurement_type}`
      );
    }

    const { budget_plan_id, budget_year, ...projectData } = data;
    void budget_plan_id;
    void budget_year;
    const project = await tx.project.create({
      data: {
        ...projectData,
        status: ProjectStatus.UNASSIGNED,
        current_workflow_type: data.procurement_type,
        responsible_unit_id: unitType.get(data.procurement_type),
        procurement_unit_id: unitType.get(data.procurement_type),
        receive_no: receiveNumber,
        created_by: user.id,
      },
    });

    if (data.budget_plan_id && data.budget_plan_id.length > 0) {
      await tx.budgetPlan.updateMany({
        where: { id: { in: data.budget_plan_id } },
        data: { project_id: project.id },
      });
    }

    return project;
  });
};

export const importProjects = async (
  user: AuthPayload,
  data: CreateProjectDto[]
): Promise<ProjectsListResponse> => {
  assertCapability(user, Capability.PROJECT_IMPORT);
  return await prisma.$transaction(async (tx) => {
    await acquireProjectCreationLock(tx);

    await checkRefNumberDuplication(
      tx,
      data.map((d) => d.pr_no).filter((n): n is string => !!n),
      data.map((d) => d.less_no).filter((n): n is string => !!n),
      data.map((d) => d.po_no).filter((n): n is string => !!n)
    );

    const unitType = await getProcurementTypeToUnitIdMap(tx);

    // Track per-year offsets to avoid gaps when multiple budget_year values are present
    const bufferByYear = new Map<number, number>();

    const receiveNumbers = await Promise.all(
      data.map((d) => {
        const year = d.budget_year || currentBangkokBudgetYear();

        const currentBuffer = bufferByYear.get(year) ?? 0;

        bufferByYear.set(year, currentBuffer + 1);

        return getReceiveNumberSync(tx, d.budget_year, currentBuffer);
      })
    );

    // 5. Bulk create projects (createManyAndReturn)
    for (const d of data) {
      if (unitType.get(d.procurement_type) == null) {
        throw new NotFoundError(
          `Responsible unit not found for procurement type ${d.procurement_type} in project ${d.title}`
        );
      }
    }

    const createdProjects = await tx.project.createManyAndReturn({
      data: data.map((d, i) => {
        const { budget_plan_id, budget_year, ...projectData } = d;
        void budget_plan_id;
        void budget_year;
        return {
          ...projectData,
          status: ProjectStatus.UNASSIGNED,
          current_workflow_type: d.procurement_type,
          responsible_unit_id: unitType.get(d.procurement_type)!,
          procurement_unit_id: unitType.get(d.procurement_type)!,
          receive_no: receiveNumbers[i],
          created_by: user.id,
        };
      }),
    });

    return {
      total: createdProjects.length,
      data: createdProjects,
    };
  });
};

export const updateProjectData = async (
  user: AuthPayload,
  data: UpdateProjectDto
): Promise<UpdateProjectDataResponse> => {
  assertCapability(user, Capability.PROJECT_UPDATE);
  if (!data || !data.updateData || Object.keys(data.updateData).length === 0) {
    throw new BadRequestError('No data provided for update');
  }
  return await prisma.$transaction(async (tx) => {
    const current = await tx.project.findUnique({
      where: { id: data.id },
    });
    if (!current) {
      throw new NotFoundError('Project not found');
    }

    if (data.updateData.installment_rounds !== undefined) {
      await assertInstallmentRoundsCanBeUpdated(tx, current.id);
    }

    await checkRefNumberDuplication(
      tx,
      data.updateData.pr_no ? [data.updateData.pr_no] : [],
      data.updateData.less_no ? [data.updateData.less_no] : [],
      data.updateData.po_no ? [data.updateData.po_no] : [],
      data.updateData.migo_103_no ? [data.updateData.migo_103_no] : [],
      data.updateData.migo_105_no ? [data.updateData.migo_105_no] : [],
      current.id
    );

    const { budget_plan_id, ...projectData } = data.updateData;

    const oldValue = {};
    Object.keys(projectData).forEach((key) => {
      oldValue[key] = current[key];
    });

    const updated = await tx.project.update({
      where: { id: data.id },
      data: { ...projectData },
    });

    if (budget_plan_id && budget_plan_id.length > 0) {
      await tx.budgetPlan.updateMany({
        where: { id: { in: budget_plan_id } },
        data: { project_id: data.id },
      });
    }

    await createProjectHistoryAndAuditEvent(tx, {
      projectId: data.id,
      action: ProjectActionType.INFORMATION_UPDATE,
      oldValue: { ...oldValue },
      newValue: { ...projectData },
      changedBy: user,
    });

    return updated;
  });
};

export const generateContractNumber = async (
  user: AuthPayload,
  type: string,
  budget_year: number
): Promise<{ id: string; contract_no: string }> => {
  assertCapability(user, Capability.CONTRACT_MANAGE);
  return await prisma.$transaction(async (tx) => {
    const lockKey = `${budget_year}:${type}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
    const newContractNo = await tx.projectContractNumber
      .count({
        where: {
          type,
          contract_no: {
            endsWith: `/${budget_year}`,
          },
        },
      })
      .then((count) => {
        return `${count + 1}/${budget_year}`;
      });

    const newContract = await tx.projectContractNumber.create({
      data: {
        type,
        contract_no: newContractNo,
      },
      select: {
        id: true,
        contract_no: true,
        type: true,
        is_active: true,
        cancellation_reason: true,
      },
    });

    await recordAuditEvent(tx, {
      kind: AuditLogType.CONTRACT_NUMBER,
      eventType: AuditEventType.CONTRACT_NUMBER_CREATED,
      targetType: AuditTargetType.CONTRACT_NUMBER,
      targetId: newContract.id,
      actor: user,
      actorId: user.id,
      targetSnapshot: await buildContractNumberTargetSnapshot(tx, newContract),
      sourceTable: 'project_contract_numbers',
      sourceId: newContract.id,
    });

    return { id: newContract.id, contract_no: newContract.contract_no };
  });
};

export const cancelContractNumber = async (
  user: AuthPayload,
  contractId: string,
  reason: string
): Promise<{
  id: string;
  contract_no: string;
  is_active: boolean;
  cancellation_reason: string;
}> => {
  assertCapability(user, Capability.CONTRACT_MANAGE);
  return await prisma.$transaction(async (tx) => {
    const contract = await tx.projectContractNumber.findFirst({
      where: { id: contractId, ...activeContractNumberWhere() },
      select: {
        id: true,
        contract_no: true,
        project: { select: { id: true } },
      },
    });
    if (!contract) {
      throw new BadRequestError('Active contract number not found');
    }

    if (contract.project) {
      await tx.project.update({
        where: { id: contract.project.id },
        data: { contract_no_id: null },
      });
      await createProjectHistoryAndAuditEvent(tx, {
        projectId: contract.project.id,
        action: ProjectActionType.INFORMATION_UPDATE,
        oldValue: { contract_no: contract.contract_no },
        newValue: { contract_no: null },
        changedBy: user,
      });
    }

    const updated = await tx.projectContractNumber.update({
      where: { id: contractId },
      data: { is_active: false, cancellation_reason: reason },
      select: {
        id: true,
        contract_no: true,
        type: true,
        is_active: true,
        cancellation_reason: true,
      },
    });

    await recordAuditEvent(tx, {
      kind: AuditLogType.CONTRACT_NUMBER,
      eventType: AuditEventType.CONTRACT_NUMBER_CANCELLED,
      targetType: AuditTargetType.CONTRACT_NUMBER,
      targetId: updated.id,
      actor: user,
      actorId: user.id,
      targetSnapshot: await buildContractNumberTargetSnapshot(tx, updated),
      comment: reason,
      sourceTable: 'project_contract_numbers',
      sourceId: updated.id,
    });

    return {
      id: updated.id,
      contract_no: updated.contract_no,
      is_active: updated.is_active,
      cancellation_reason: updated.cancellation_reason!,
    };
  });
};

export const deleteProject = async (
  user: AuthPayload,
  id: string
): Promise<void> => {
  assertCapability(user, Capability.PROJECT_DELETE);
  await prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!project) throw new NotFoundError('Project not found');
    await assertProjectCanBeDeleted(tx, id);
    await tx.project.delete({ where: { id } });
  });
};
