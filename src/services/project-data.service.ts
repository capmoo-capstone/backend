import { Prisma, ProjectStatus, ProjectActionType } from '@prisma/client';
import { prisma } from '../config/prisma';
import { NotFoundError, BadRequestError, AppError } from '../lib/errors';
import { getProcurementTypeToUnitIdMap } from '../lib/unit-type';
import { AuthPayload } from '../types/auth.type';
import { CreateProjectDto, UpdateProjectDto } from '../schemas/project.schema';
import {
  CreateProjectResponse,
  ProjectsListResponse,
  UpdateProjectDataResponse,
} from '../types/project.type';

const acquireProjectCreationLock = async (tx: Prisma.TransactionClient) => {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('project_creation_lock'))`;
};

const getReceiveNumberSync = async (
  tx: Prisma.TransactionClient,
  budget_year?: number,
  buffer = 0
): Promise<string> => {
  if (!budget_year) {
    const thisYear = new Date().getFullYear() + 543;
    const currentMonth = new Date().getMonth() + 1;
    budget_year = currentMonth >= 10 ? thisYear + 1 : thisYear;
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

const checkRefNumberDuplication = async (
  tx: Prisma.TransactionClient,
  pr_no: string[] = [],
  less_no: string[] = [],
  excludeProjectId?: string
) => {
  if (pr_no.length === 0 && less_no.length === 0) return;
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
  if (excludeProjectId) {
    whereClause.NOT = { id: excludeProjectId };
  }

  const existing = await tx.project.findFirst({
    where: whereClause,
    select: { id: true, pr_no: true, less_no: true },
  });
  if (existing) {
    if (pr_no.includes(existing.pr_no)) {
      throw new AppError(`Duplicate PR number: ${existing.pr_no}`, 409);
    }
    if (less_no.includes(existing.less_no)) {
      throw new AppError(`Duplicate LESS number: ${existing.less_no}`, 409);
    }
  }
};

export const createProject = async (
  user: AuthPayload,
  data: CreateProjectDto
): Promise<CreateProjectResponse> => {
  return await prisma.$transaction(async (tx) => {
    await acquireProjectCreationLock(tx);

    await checkRefNumberDuplication(
      tx,
      data.pr_no ? [data.pr_no] : [],
      data.less_no ? [data.less_no] : []
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
    const project = await tx.project.create({
      data: {
        ...projectData,
        status: ProjectStatus.UNASSIGNED,
        current_workflow_type: data.procurement_type,
        responsible_unit_id: unitType.get(data.procurement_type),
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
  return await prisma.$transaction(async (tx) => {
    await acquireProjectCreationLock(tx);

    await checkRefNumberDuplication(
      tx,
      data.map((d) => d.pr_no).filter((n): n is string => !!n),
      data.map((d) => d.less_no).filter((n): n is string => !!n)
    );

    const unitType = await getProcurementTypeToUnitIdMap(tx);

    // Track per-year offsets to avoid gaps when multiple budget_year values are present
    const bufferByYear = new Map<number, number>();

    const receiveNumbers = await Promise.all(
      data.map((d) => {
        const year =
          d.budget_year ||
          (() => {
            const thisYear = new Date().getFullYear() + 543;
            const currentMonth = new Date().getMonth() + 1;
            return currentMonth >= 10 ? thisYear + 1 : thisYear;
          })();

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
        return {
          ...projectData,
          status: ProjectStatus.UNASSIGNED,
          current_workflow_type: d.procurement_type,
          responsible_unit_id: unitType.get(d.procurement_type)!,
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

    await checkRefNumberDuplication(
      tx,
      data.updateData.pr_no ? [data.updateData.pr_no] : [],
      data.updateData.less_no ? [data.updateData.less_no] : [],
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

    await tx.projectHistory.create({
      data: {
        project_id: data.id,
        action: ProjectActionType.INFORMATION_UPDATE,
        old_value: { ...oldValue },
        new_value: { ...projectData },
        changed_by: user.id,
      },
    });

    return updated;
  });
};

export const generateContractNumber = async (
  type: string,
  budget_year: number
): Promise<{ id: string; contract_no: string }> => {
  const count = await prisma.projectContractNumber.count({
    where: {
      type,
      contract_no: {
        endsWith: budget_year.toString(),
      },
    },
  });
  const newContract = await prisma.projectContractNumber.create({
    data: {
      type,
      contract_no: `${(count + 1).toString()}/${budget_year}`,
    },
    select: { id: true, contract_no: true },
  });
  return newContract;
};

export const cancelContractNumber = async (
  projectId: string
): Promise<{ id: string; contract_no: string }> => {
  return await prisma.projectContractNumber.update({
    where: { project_id: projectId },
    data: { is_active: false },
    select: { id: true, contract_no: true, is_active: true },
  });
};

export const deleteProject = async (
  user: AuthPayload,
  id: string
): Promise<void> => {
  const project = await prisma.project.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!project) {
    throw new NotFoundError('Project not found');
  }
  await prisma.project.delete({
    where: { id },
  });
};
