import { AuditEventType, AuditLogType, AuditTargetType } from '@prisma/client';
import { PaginatedResponse } from './common.type';

export interface AuditActor {
  id: string;
  name: string;
}

export interface AuditTarget {
  id: string;
  type: AuditTargetType;
  name: string;
  refNo: string | null;
}

export interface AuditLogItem {
  id: string;
  kind: AuditLogType;
  eventType: AuditEventType;
  occurredAt: string;
  title: string;
  description: string;
  actor: AuditActor | null;
  target: AuditTarget;
  details: Record<string, unknown>;
}

export type AuditLogsResponse = PaginatedResponse<AuditLogItem>;
