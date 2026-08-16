import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { hasOrganizationWideReadAccess } from '../lib/access-policy';
import { getDeptIdsForUser } from '../lib/permissions';
import {
  BudgetPlanFilterQuery,
  ImportBudgetPlanDto,
} from '../schemas/budget-plan.schema';
import { AuthPayload } from '../types/auth.type';
import {
  ImportBudgetPlanResponse,
  PaginatedBudgetPlans,
  UpdateProjectIdPlanResponse,
} from '../types/budget-plan.type';

export const listBudgetPlans = async (
  user: AuthPayload,
  page: number = 1,
  limit: number = 10,
  filters: BudgetPlanFilterQuery = {}
): Promise<PaginatedBudgetPlans> => {
  const andConditions: Prisma.BudgetPlanWhereInput[] = [];
  const hasOrganizationWideRead = hasOrganizationWideReadAccess(user);
  if (!hasOrganizationWideRead) {
    const allowedDeptIds = getDeptIdsForUser(user);
    andConditions.push({ unit: { dept_id: { in: allowedDeptIds } } });
  } else if (filters.departments && filters.departments.length > 0) {
    andConditions.push({ unit: { dept_id: { in: filters.departments } } });
  }

  if (filters.units && filters.units.length > 0) {
    andConditions.push({ unit_id: { in: filters.units } });
  }

  if (filters.fiscalYear) {
    andConditions.push({ budget_year: filters.fiscalYear });
  }

  if (filters.available !== undefined) {
    if (filters.available === true) {
      andConditions.push({ project_id: null });
    } else {
      andConditions.push({ NOT: { project_id: null } });
    }
  }

  if (filters.activityName?.trim()) {
    const activityNameTerm = filters.activityName.trim();
    andConditions.push({
      activity_type_name: {
        contains: activityNameTerm,
        mode: Prisma.QueryMode.insensitive,
      },
    });
  }

  // General search
  if (filters.search?.trim()) {
    const searchTerm = filters.search.trim();
    const searchOr: Prisma.BudgetPlanWhereInput[] = [
      {
        activity_type_name: {
          contains: searchTerm,
          mode: Prisma.QueryMode.insensitive,
        },
      },
      {
        description: {
          contains: searchTerm,
          mode: Prisma.QueryMode.insensitive,
        },
      },
      {
        budget_name: {
          contains: searchTerm,
          mode: Prisma.QueryMode.insensitive,
        },
      },
      {
        unit: {
          name: { contains: searchTerm, mode: Prisma.QueryMode.insensitive },
        },
      },
      {
        unit: {
          department: {
            name: { contains: searchTerm, mode: Prisma.QueryMode.insensitive },
          },
        },
      },
    ];
    andConditions.push({ OR: searchOr });
  }

  const where: Prisma.BudgetPlanWhereInput =
    andConditions.length > 0 ? { AND: andConditions } : {};

  const skip = (page - 1) * limit;

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

  const formattedBudgetPlans = budgetPlans.map((plan) => {
    const { unit, ...rest } = plan;
    return {
      ...rest,
      unit_name: unit?.name,
      dept_name: unit?.department?.name,
    };
  });

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
