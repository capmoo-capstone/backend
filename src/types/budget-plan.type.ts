import { BudgetPlan } from '@prisma/client';
import { PaginatedResponse } from './common.type';

export type PaginatedBudgetPlans = PaginatedResponse<BudgetPlan>;
