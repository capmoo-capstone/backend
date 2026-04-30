import { z } from 'zod';
import { AuditLogType } from '@prisma/client';

export const AuditLogsQuerySchema = z.object({
  q: z.string().trim().optional(),
  kind: z.enum(AuditLogType),
  dateFrom: z.coerce.date(),
  dateTo: z.coerce.date().optional(),
});

export type AuditLogsQuery = z.infer<typeof AuditLogsQuerySchema>;
