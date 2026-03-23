import { z } from 'zod';

export const ImportBudgetPlanSchema = z.array(
  z.object({
    budget_year: z.string(),
    cost_center_no: z.string(),
    cost_center_name: z.string(),
    activity_type: z.string(),
    activity_type_name: z.string(),
    description: z.string().optional(),
    budget_amount: z.number(),
  })
);

export type ImportBudgetPlanDto = z.infer<typeof ImportBudgetPlanSchema>;
