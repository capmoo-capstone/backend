import { z } from 'zod';

import { ProcurementType } from '@prisma/client';

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

export const UnitGroupOverviewQuerySchema = z
  .object({
    unitId: z.string().optional(),
    mode: z.enum(['month', 'quarter', 'fiscalYear']).default('fiscalYear'),
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

export const UnitGroupProcurementQuerySchema = z
  .object({
    unitId: z.string().optional(),
    mode: z.enum(['month', 'quarter', 'fiscalYear']).default('fiscalYear'),
    fiscalYear: z.coerce.number().int().optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
    quarter: z.enum(['Q1', 'Q2', 'Q3', 'Q4']).optional(),
  });

export const UnitGroupTopDelayedQuerySchema = z.object({
  unitId: z.string().optional(),
  procurementType: z.nativeEnum(ProcurementType).optional(),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

export type PeriodicSummaryQuery = z.infer<typeof PeriodicSummaryQuerySchema>;
export type ProcurementOverviewQuery = z.infer<
  typeof ProcurementOverviewQuerySchema
>;
export type DeadlinesQuery = z.infer<typeof DeadlinesQuerySchema>;
export type UnitGroupOverviewQuery = z.infer<
  typeof UnitGroupOverviewQuerySchema
>;
export type UnitGroupProcurementQuery = z.infer<
  typeof UnitGroupProcurementQuerySchema
>;
export type UnitGroupTopDelayedQuery = z.infer<
  typeof UnitGroupTopDelayedQuerySchema
>;

