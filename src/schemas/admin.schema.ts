import { z } from 'zod';
import { AuditEventType, AuditLogType } from '@prisma/client';

export const AuditLogsQuerySchema = z.object({
  q: z.string().trim().optional(),
  kind: z.enum(AuditLogType).optional(),
  eventType: z.enum(AuditEventType).optional(),
  projectId: z.uuid().optional(),
  actorId: z.uuid().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

export type AuditLogsQuery = z.infer<typeof AuditLogsQuerySchema>;
