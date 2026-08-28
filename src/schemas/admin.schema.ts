import { z } from 'zod';
import { AuditEventType, AuditLogType } from '@prisma/client';
import { BangkokDateTimeSchema } from '../utils/date';

export const AuditLogsQuerySchema = z.object({
  q: z.string().trim().optional(),
  kind: z.enum(AuditLogType).optional(),
  eventType: z.enum(AuditEventType).optional(),
  projectId: z.uuid().optional(),
  actorId: z.uuid().optional(),
  dateFrom: BangkokDateTimeSchema.optional(),
  dateTo: BangkokDateTimeSchema.optional(),
});

export type AuditLogsQuery = z.infer<typeof AuditLogsQuerySchema>;
