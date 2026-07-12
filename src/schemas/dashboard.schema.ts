import { z } from 'zod';

export const PeriodicSummaryQuerySchema = z.object({
  period: z.enum(['today', 'month', 'fiscalYear']).default('today'),
});

export const ProcurementOverviewQuerySchema = z
  .object({
    mode: z.enum(['month', 'quarter', 'fiscalYear']).default('month'),
    fiscalYear: z.coerce.number().int().optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
    quarter: z.enum(['Q1', 'Q2', 'Q3', 'Q4']).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.mode === 'quarter' && !value.quarter) {
      ctx.addIssue({
        code: 'custom',
        path: ['quarter'],
        message: 'quarter is required when mode is quarter',
      });
    }
  });

export const DeadlinesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export type PeriodicSummaryQuery = z.infer<typeof PeriodicSummaryQuerySchema>;
export type ProcurementOverviewQuery = z.infer<
  typeof ProcurementOverviewQuerySchema
>;
export type DeadlinesQuery = z.infer<typeof DeadlinesQuerySchema>;
