import { z } from 'zod';
import { ProcurementType } from '@prisma/client';
import {
  bangkokDayEndUtc,
  bangkokDayStartUtc,
  parseBangkokDateTime,
} from '../lib/date';

export const DashboardModeEnum = z.enum([
  'today',
  'month',
  'quarter',
  'fiscalYear',
]);
export type DashboardMode = z.infer<typeof DashboardModeEnum>;

const parseDateFrom = (value: unknown): Date => {
  const date = parseBangkokDateTime(value);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return bangkokDayStartUtc(date);
  }
  return date;
};

const parseDateTo = (value: unknown): Date => {
  const date = parseBangkokDateTime(value);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return bangkokDayEndUtc(date);
  }
  return date;
};

export const DateFromSchema = z
  .union([z.string(), z.date()])
  .transform((value, ctx) => {
    try {
      return parseDateFrom(value);
    } catch (error) {
      ctx.addIssue({
        code: 'custom',
        message: error instanceof Error ? error.message : 'Invalid dateFrom',
      });
      return z.NEVER;
    }
  });

export const DateToSchema = z
  .union([z.string(), z.date()])
  .transform((value, ctx) => {
    try {
      return parseDateTo(value);
    } catch (error) {
      ctx.addIssue({
        code: 'custom',
        message: error instanceof Error ? error.message : 'Invalid dateTo',
      });
      return z.NEVER;
    }
  });

export const PeriodicSummaryQuerySchema = z
  .object({
    mode: DashboardModeEnum.default('today'),
    dateFrom: DateFromSchema,
    dateTo: DateToSchema,
  })
  .superRefine((value, ctx) => {
    if (value.dateFrom > value.dateTo) {
      ctx.addIssue({
        code: 'custom',
        path: ['dateFrom'],
        message: 'dateFrom must be before or equal to dateTo',
      });
    }
  });

export const ProcurementOverviewQuerySchema = z
  .object({
    deptId: z.string().optional(),
    mode: DashboardModeEnum.default('month'),
    dateFrom: DateFromSchema,
    dateTo: DateToSchema,
  })
  .superRefine((value, ctx) => {
    if (value.mode === 'today') {
      ctx.addIssue({
        code: 'custom',
        path: ['mode'],
        message: "This dashboard cannot use the mode 'today'",
      });
    }
    if (value.dateFrom > value.dateTo) {
      ctx.addIssue({
        code: 'custom',
        path: ['dateFrom'],
        message: 'dateFrom must be before or equal to dateTo',
      });
    }
  });

export const DeadlinesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export const UnitGroupQuerySchema = z
  .object({
    unitId: z.string(),
    mode: DashboardModeEnum,
    dateFrom: DateFromSchema,
    dateTo: DateToSchema,
  })
  .superRefine((value, ctx) => {
    if (value.dateFrom > value.dateTo) {
      ctx.addIssue({
        code: 'custom',
        path: ['dateFrom'],
        message: 'dateFrom must be before or equal to dateTo',
      });
    }
  });

export const UnitGroupTopDelayedQuerySchema = z.object({
  unitId: z.string(),
  procurementType: z.nativeEnum(ProcurementType),
  mode: DashboardModeEnum,
  dateFrom: DateFromSchema,
  dateTo: DateToSchema,
});

export const UnitGroupStaffPerformanceQuerySchema = z
  .object({
    unitId: z.string(),
    mode: DashboardModeEnum,
    dateFrom: DateFromSchema,
    dateTo: DateToSchema,
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .superRefine((value, ctx) => {
    if (value.dateFrom > value.dateTo) {
      ctx.addIssue({
        code: 'custom',
        path: ['dateFrom'],
        message: 'dateFrom must be before or equal to dateTo',
      });
    }
  });

export type PeriodicSummaryQuery = z.infer<typeof PeriodicSummaryQuerySchema>;
export type ProcurementOverviewQuery = z.infer<
  typeof ProcurementOverviewQuerySchema
>;
export type DeadlinesQuery = z.infer<typeof DeadlinesQuerySchema>;
export type UnitGroupQuery = z.infer<typeof UnitGroupQuerySchema>;
export type UnitGroupTopDelayedQuery = z.infer<
  typeof UnitGroupTopDelayedQuerySchema
>;
export type UnitGroupStaffPerformanceQuery = z.infer<
  typeof UnitGroupStaffPerformanceQuerySchema
>;
