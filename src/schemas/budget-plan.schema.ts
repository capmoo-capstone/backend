import { z } from 'zod';

const stringOrArrayToStringArray = (val: unknown): string[] | undefined => {
  if (val === undefined || val === null || val === '') return undefined;
  if (Array.isArray(val)) {
    const items = val
      .flatMap((v) => (typeof v === 'string' ? v.split(',') : []))
      .map((s) => s.trim())
      .filter(Boolean);
    return items.length > 0 ? items : undefined;
  }
  if (typeof val === 'string') {
    const items = val
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return items.length > 0 ? items : undefined;
  }
  return undefined;
};

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
export type BudgetPlanFilterQuery = z.infer<
  typeof BudgetPlanFilterQuerySchema
>;

