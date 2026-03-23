import { prisma } from '../config/prisma';
import { AuthPayload } from '../types/auth.type';
import { ImportBudgetPlanDto } from '../schemas/budget-plan.schema';
import { PaginatedBudgetPlans } from '../types/budget-plan.type';

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
  user: AuthPayload,
  data: ImportBudgetPlanDto
): Promise<any> => {
  const formatData = await Promise.all(
    data.map(async (item) => ({
      ...item,
      unit_id: (
        await prisma.unit.findFirstOrThrow({
          where: { name: item.cost_center_name },
          select: { id: true },
        })
      ).id,
      unit_no: item.cost_center_no,
      created_by: user.id,
    }))
  );

  const budgetPlan = await prisma.budgetPlan.createManyAndReturn({
    data: formatData,
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
  user: AuthPayload,
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

export const deleteBudgetPlan = async (
  user: AuthPayload,
  id: string
): Promise<void> => {
  await prisma.budgetPlan.delete({
    where: { id },
  });
};
