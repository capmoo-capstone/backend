import { z } from 'zod';

export const ImportBudgetPlanSchema = z.array(
  z.object({
    budget_year: z.number(),
    unit_id: z.string(),
    activity_type: z.number().min(6),
    activity_type_name: z.string(),
    description: z.string(),
    budget_name: z.string(),
    budget_amount: z.number(),
  })
);

export type ImportBudgetPlanDto = z.infer<typeof ImportBudgetPlanSchema>;
