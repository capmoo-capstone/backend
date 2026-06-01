import { BudgetPlan } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/client';
import { ListResponse, PaginatedResponse } from './common.type';

export type PaginatedBudgetPlans = PaginatedResponse<BudgetPlan> & {
  data: Array<BudgetPlan & { unit_name?: string; dept_name?: string }>;
};

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
