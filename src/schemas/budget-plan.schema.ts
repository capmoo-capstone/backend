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

export const BudgetPlanFilterQuerySchema = z.object({
  search: z.string().trim().optional(),
  activityName: z.string().trim().optional(),
  fiscalYear: z.coerce.number().optional(),
  departments: z.array(z.string()).optional(),
  units: z.array(z.string()).optional(),
  available: z.coerce.boolean().optional(),
});

export type ImportBudgetPlanDto = z.infer<typeof ImportBudgetPlanSchema>;
export type BudgetPlanFilterQuery = z.infer<typeof BudgetPlanFilterQuerySchema>;
