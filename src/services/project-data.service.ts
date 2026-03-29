import { Prisma, ProjectStatus, LogActionType } from '@prisma/client';
import { prisma } from '../config/prisma';
import { NotFoundError, BadRequestError } from '../lib/errors';
import { AuthPayload } from '../types/auth.type';
import { CreateProjectDto, UpdateProjectDto } from '../schemas/project.schema';

const getReceiveNumber = async (
  tx: Prisma.TransactionClient,
  budget_year?: number
) => {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('project_creation_lock'))`;
  const count = await tx.project.count();
  budget_year = 2569;
  const format = budget_year
    .toString()
    .concat('/')
    .concat((count + 1).toString().padStart(5, '0'));

  return format;
};

export const createProject = async (
  user: AuthPayload,
  data: CreateProjectDto
): Promise<any> => {
  return await prisma.$transaction(async (tx) => {
    const responsibleUnit = await tx.unit.findFirst({
      where: { type: { has: data.procurement_type } },
      select: { id: true },
    });
    if (!responsibleUnit) {
      throw new NotFoundError('Responsible unit not found');
    }
    if (data.budget_plan_id && data.budget_plan_id.length > 0) {
      const budgetPlans = await tx.budgetPlan.findMany({
        where: { id: { in: data.budget_plan_id } },
        select: { id: true },
      });
      if (budgetPlans.length !== data.budget_plan_id.length) {
        throw new NotFoundError('One or more budget plans not found');
      }
    }

    const receiveNumber = await getReceiveNumber(tx);
    const project = await tx.project.create({
      data: {
        ...data,
        status: ProjectStatus.UNASSIGNED,
        current_workflow_type: data.procurement_type,
        responsible_unit_id: responsibleUnit.id,
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

    return { data: project };
  });
};

export const importProjects = async (
  user: AuthPayload,
  data: CreateProjectDto[]
): Promise<any> => {
  return await prisma.$transaction(async (tx) => {
    const createdProjects = [];
    for (const projectData of data) {
      const responsibleUnit = await tx.unit.findFirst({
        where: { type: { has: projectData.procurement_type } },
        select: { id: true },
      });
      if (!responsibleUnit) {
        throw new NotFoundError(
          `Responsible unit not found for procurement type ${projectData.procurement_type}`
        );
      }
      const receiveNumber = await getReceiveNumber(tx);
      const project = await tx.project.create({
        data: {
          ...projectData,
          status: ProjectStatus.UNASSIGNED,
          current_workflow_type: projectData.procurement_type,
          responsible_unit_id: responsibleUnit.id,
          receive_no: receiveNumber,
          created_by: user.id,
        },
      });
      createdProjects.push(project);
    }

    return { data: createdProjects };
  });
};

export const updateProjectData = async (
  user: AuthPayload,
  data: UpdateProjectDto
) => {
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
    const oldValue: any = {};
    Object.keys(data.updateData).forEach((key) => {
      oldValue[key] = (current as any)[key];
    });

    const updated = await tx.project.update({
      where: { id: data.id },
      data: { ...data.updateData },
    });

    await tx.projectHistory.create({
      data: {
        project_id: data.id,
        action: LogActionType.INFORMATION_UPDATE,
        old_value: { ...oldValue },
        new_value: { ...data.updateData },
        changed_by: user.id,
      },
    });

    return { data: updated };
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
