import { prisma } from '../config/prisma';
import { AuthPayload } from '../lib/types';
import {
  ImportBudgetPlanDto,
  PaginatedBudgetPlans,
} from '../models/BudgetPlan';

export const listBudgetPlans = async (
  user: AuthPayload,
  page: number,
  limit: number
): Promise<PaginatedBudgetPlans> => {
  const skip = (page - 1) * limit;

  const [budgetPlans, total] = await Promise.all([
    prisma.budgetPlan.findMany({
      skip: skip,
      take: limit,
      orderBy: { created_at: 'desc' },
    }),
    prisma.budgetPlan.count(),
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
  data: ImportBudgetPlanDto
): Promise<any> => {
  const budgetPlan = await prisma.budgetPlan.createManyAndReturn({
    data,
    skipDuplicates: true,
    select: {
      id: true,
      activity_type_name: true,
      budget_amount: true,
    },
  });

  return { data: budgetPlan };
};

export const updateProjectIdPlan = async (
  id: string,
  projectId: string
): Promise<any> => {
  const updatedBudgetPlan = await prisma.budgetPlan.update({
    where: { id },
    data: { project_id: projectId },
    select: {
      id: true,
      activity_type_name: true,
      budget_amount: true,
      project_id: true,
    },
  });

  return { data: updatedBudgetPlan };
};

export const deleteBudgetPlan = async (id: string): Promise<void> => {
  await prisma.budgetPlan.delete({
    where: { id },
  });
};
