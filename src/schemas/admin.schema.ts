import { z } from 'zod';
import { AuditLogType } from '@prisma/client';

export const AuditLogsQuerySchema = z.object({
  q: z.string().trim().optional(),
  kind: z.enum(AuditLogType).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

export type AuditLogsQuery = z.infer<typeof AuditLogsQuerySchema>;
