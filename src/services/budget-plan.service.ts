import { prisma } from '../config/prisma';
import { ImportBudgetPlanDto } from '../schemas/budget-plan.schema';
import { AuthPayload } from '../types/auth.type';
import {
  ImportBudgetPlanResponse,
  PaginatedBudgetPlans,
  UpdateProjectIdPlanResponse,
} from '../types/budget-plan.type';

export const listBudgetPlans = async (
  _user: AuthPayload,
  page: number,
  limit: number,
  deptId?: string,
  unitId?: string,
  available?: boolean
): Promise<PaginatedBudgetPlans> => {
  const skip = (page - 1) * limit;
  let where = {};
  if (deptId) {
    where = { unit: { dept_id: deptId } };
  }
  if (unitId) {
    where = { ...where, unit_id: unitId };
  }
  if (available !== undefined) {
    if (available === true) {
      where = { ...where, project_id: null };
    } else where = { ...where, NOT: { project_id: null } };
  }

  const [budgetPlans, total] = await Promise.all([
    prisma.budgetPlan.findMany({
      where,
      include: {
        unit: {
          select: {
            name: true,
            department: {
              select: { name: true },
            },
          },
        },
      },
      skip: skip,
      take: limit,
      orderBy: { created_at: 'desc' },
    }),
    prisma.budgetPlan.count({ where }),
  ]);

  const formattedBudgetPlans = budgetPlans.map((plan) => ({
    ...plan,
    unit_name: plan.unit?.name,
    dept_name: plan.unit?.department?.name,
    unit: undefined,
  }));

  return {
    total,
    page,
    pageSize: limit,
    totalPages: Math.ceil(total / limit),
    data: formattedBudgetPlans,
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
