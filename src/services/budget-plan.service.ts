import { prisma } from '../config/prisma';
import { AuthPayload } from '../types/auth.type';
import { ImportBudgetPlanDto } from '../schemas/budget-plan.schema';
import {
  ImportBudgetPlanResponse,
  PaginatedBudgetPlans,
  UpdateProjectIdPlanResponse,
} from '../types/budget-plan.type';

export const listBudgetPlans = async (
  user: AuthPayload,
  unitId: string,
  page: number,
  limit: number,
  available?: boolean
): Promise<PaginatedBudgetPlans> => {
  const skip = (page - 1) * limit;
  let where = {};
  if (unitId) {
    where = { unit_id: unitId };
  }
  if (available !== undefined) {
    if (available === true) {
      where = { ...where, project_id: null };
    } else where = { ...where, NOT: { project_id: null } };
  }

  const [budgetPlans, total] = await Promise.all([
    prisma.budgetPlan.findMany({
      where,
      skip: skip,
      take: limit,
      orderBy: { created_at: 'desc' },
    }),
    prisma.budgetPlan.count({ where }),
  ]);

  return {
    total,
    page,
    pageSize: limit,
    totalPages: Math.ceil(total / limit),
    data: budgetPlans,
  };
};

export const importBudgetPlan = async (
  user: AuthPayload,
  data: ImportBudgetPlanDto
): Promise<ImportBudgetPlanResponse> => {
  const formatData = data.map((item) => ({
    ...item,
    created_by: user.id,
  }));

  const budgetPlan = await prisma.budgetPlan.createManyAndReturn({
    data: formatData,
    skipDuplicates: true,
    select: {
      id: true,
      activity_type_name: true,
      budget_name: true,
      budget_amount: true,
    },
  });

  return {
    total: budgetPlan.length,
    data: budgetPlan,
  };
};

export const updateProjectIdPlan = async (
  user: AuthPayload,
  id: string,
  projectId: string
): Promise<UpdateProjectIdPlanResponse> => {
  const updatedBudgetPlan = await prisma.budgetPlan.update({
    where: { id },
    data: { project_id: projectId },
    select: {
      id: true,
      activity_type_name: true,
      budget_name: true,
      budget_amount: true,
      project_id: true,
    },
  });

  return updatedBudgetPlan;
};

export const deleteBudgetPlan = async (
  user: AuthPayload,
  id: string
): Promise<void> => {
  await prisma.budgetPlan.delete({
    where: { id },
  });
};
