import { BudgetPlan } from '@prisma/client';
import { ListResponse, PaginatedResponse } from './common.type';
import { Decimal } from '@prisma/client/runtime/client';

export type PaginatedBudgetPlans = PaginatedResponse<BudgetPlan>;

export interface BudgetPlanDetailResponse {
  id: string;
  activity_type_name: string;
  budget_name: string | null;
  budget_amount: Decimal;
}

export type ImportBudgetPlanResponse = ListResponse<BudgetPlanDetailResponse>;

export interface UpdateProjectIdPlanResponse extends BudgetPlanDetailResponse {
  project_id: string | null;
}
