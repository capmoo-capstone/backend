import {
  AuditEvent,
  AuditEventType,
  AuditLogType,
  AuditTargetType,
  Prisma,
  ProjectActionType,
} from '@prisma/client';
import { prisma } from '../config/prisma';
import { ForbiddenError, NotFoundError } from '../lib/errors';
import { getDeptIdsForUser, haveSupplyPermission } from '../lib/permissions';
import { AuditLogsQuery } from '../schemas/admin.schema';
import {
  AuditActor,
  AuditLogItem,
  AuditLogsResponse,
  AuditTarget,
} from '../types/audit-log.type';
import { AuthPayload } from '../types/auth.type';

type AuditClient = Prisma.TransactionClient;
type AuditEventJson = Prisma.JsonValue | null;

type ActorInput =
  | Pick<
      AuthPayload,
      'id' | 'full_name' | 'roles' | 'is_delegated' | 'delegated_by'
    >
  | {
      id: string;
      full_name?: string;
      name?: string;
    }
  | null;

export interface AuditFieldDiff {
  field: string;
  oldValue: Prisma.InputJsonValue | null;
  newValue: Prisma.InputJsonValue | null;
}

interface RecordAuditEventInput {
  kind: AuditLogType;
  eventType: AuditEventType;
  targetType: AuditTargetType;
  targetId: string;
  projectId?: string | null;
  actor?: ActorInput;
  actorId?: string | null;
  actorSnapshot?: Record<string, unknown>;
  targetSnapshot: Record<string, unknown>;
  diff?: AuditFieldDiff[];
  comment?: string | null;
  metadata?: Record<string, unknown> | null;
  sourceTable?: string | null;
  sourceId?: string | null;
  occurredAt?: Date;
}

interface CreateProjectHistoryAuditInput {
  projectId: string;
  action: ProjectActionType;
  oldValue: Record<string, unknown>;
  newValue: Record<string, unknown>;
  changedBy: ActorInput | string;
  comment?: string | null;
}

const actionToEventType: Record<ProjectActionType, AuditEventType> = {
  [ProjectActionType.INFORMATION_UPDATE]: AuditEventType.PROJECT_DATA_UPDATED,
  [ProjectActionType.ASSIGNEE_UPDATE]: AuditEventType.PROJECT_ASSIGNEE_UPDATED,
  [ProjectActionType.STATUS_UPDATE]: AuditEventType.PROJECT_STATUS_UPDATED,
  [ProjectActionType.STEP_UPDATE]: AuditEventType.PROJECT_STEP_UPDATED,
};

const titleByEventType: Record<AuditEventType, string> = {
  [AuditEventType.PROJECT_DATA_UPDATED]: 'Project information updated',
  [AuditEventType.PROJECT_ASSIGNEE_UPDATED]: 'Project assignee updated',
  [AuditEventType.PROJECT_STATUS_UPDATED]: 'Project status updated',
  [AuditEventType.PROJECT_STEP_UPDATED]: 'Project step updated',
  [AuditEventType.USER_DELEGATION_CREATED]: 'User delegation created',
  [AuditEventType.USER_DELEGATION_CANCELLED]: 'User delegation cancelled',
  [AuditEventType.PROJECT_CANCELLATION_CREATED]:
    'Project cancellation requested',
  [AuditEventType.PROJECT_CANCELLATION_APPROVED]:
    'Project cancellation approved',
  [AuditEventType.PROJECT_CANCELLATION_REJECTED]:
    'Project cancellation rejected',
  [AuditEventType.CONTRACT_NUMBER_CREATED]: 'Contract number created',
  [AuditEventType.CONTRACT_NUMBER_CANCELLED]: 'Contract number cancelled',
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  Object.getPrototypeOf(value) === Object.prototype;

export const toAuditJsonValue = (
  value: unknown
): Prisma.InputJsonValue | null => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();

  const valueType = typeof value;
  if (
    valueType === 'string' ||
    valueType === 'number' ||
    valueType === 'boolean'
  ) {
    return value as Prisma.InputJsonValue;
  }
  if (valueType === 'bigint') return value.toString();
  if (Array.isArray(value)) {
    return value.map((item) => toAuditJsonValue(item));
  }

  if (typeof value === 'object') {
    const withJson = value as { toJSON?: () => unknown };
    if (typeof withJson.toJSON === 'function' && !isPlainObject(value)) {
      return toAuditJsonValue(withJson.toJSON());
    }

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, nestedValue]) => nestedValue !== undefined)
        .map(([key, nestedValue]) => [key, toAuditJsonValue(nestedValue)])
    ) as Prisma.InputJsonObject;
  }

  return String(value);
};

const jsonEquals = (left: unknown, right: unknown) =>
  JSON.stringify(toAuditJsonValue(left)) ===
  JSON.stringify(toAuditJsonValue(right));

export const buildAuditDiff = (
  oldValue: Record<string, unknown>,
  newValue: Record<string, unknown>
): AuditFieldDiff[] => {
  const fields = new Set([...Object.keys(oldValue), ...Object.keys(newValue)]);

  return [...fields]
    .filter((field) => !jsonEquals(oldValue[field], newValue[field]))
    .map((field) => ({
      field,
      oldValue: toAuditJsonValue(oldValue[field]),
      newValue: toAuditJsonValue(newValue[field]),
    }));
};

const collectSearchValues = (value: unknown, output: string[]) => {
  if (value === null || value === undefined) return;

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    output.push(String(value));
    return;
  }

  if (value instanceof Date) {
    output.push(value.toISOString());
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectSearchValues(item, output));
    return;
  }

  if (typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((item) =>
      collectSearchValues(item, output)
    );
  }
};

export const buildAuditSearchText = (
  input: Pick<
    RecordAuditEventInput,
    | 'kind'
    | 'eventType'
    | 'targetType'
    | 'targetId'
    | 'projectId'
    | 'comment'
    | 'targetSnapshot'
    | 'actorSnapshot'
    | 'metadata'
    | 'diff'
  >
) => {
  const values = [
    input.kind,
    input.eventType,
    input.targetType,
    input.targetId,
    input.projectId,
    input.comment,
  ].filter((value): value is string => Boolean(value));

  collectSearchValues(input.actorSnapshot, values);
  collectSearchValues(input.targetSnapshot, values);
  collectSearchValues(input.metadata, values);
  collectSearchValues(input.diff, values);

  return values.join(' ').toLowerCase();
};

const asRecord = (value: AuditEventJson): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;

const getActorId = (actor?: ActorInput, actorId?: string | null) => {
  if (actor && 'id' in actor) return actor.id;
  return actorId ?? null;
};

const buildActorSnapshot = async (
  tx: AuditClient,
  actor?: ActorInput,
  actorId?: string | null
) => {
  if (actor) {
    const displayName =
      'full_name' in actor && actor.full_name
        ? actor.full_name
        : 'name' in actor
          ? actor.name
          : null;

    return {
      id: actor.id,
      name: displayName,
      full_name: displayName,
      roles: 'roles' in actor ? actor.roles : undefined,
      is_delegated: 'is_delegated' in actor ? actor.is_delegated : undefined,
      delegated_by: 'delegated_by' in actor ? actor.delegated_by : undefined,
    };
  }

  if (!actorId) {
    return { id: null, name: null, full_name: null };
  }

  const user = await tx.user.findUnique({
    where: { id: actorId },
    select: { id: true, full_name: true },
  });

  return {
    id: actorId,
    name: user?.full_name ?? null,
    full_name: user?.full_name ?? null,
  };
};

export const buildProjectTargetSnapshot = async (
  tx: AuditClient,
  projectId: string
) => {
  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: { id: true, title: true, receive_no: true },
  });

  return {
    id: projectId,
    type: AuditTargetType.PROJECT,
    name: project?.title ?? projectId,
    refNo: project?.receive_no ?? null,
  };
};

export const buildContractNumberTargetSnapshot = async (
  tx: AuditClient,
  contract: {
    id: string;
    type: string;
    contract_no: string;
    is_active?: boolean;
    cancellation_reason?: string | null;
  }
) => {
  return {
    id: contract.id,
    type: AuditTargetType.CONTRACT_NUMBER,
    name: contract.contract_no,
    refNo: contract.contract_no,
    contractType: contract.type,
    isActive: contract.is_active ?? true,
    cancellationReason: contract.cancellation_reason ?? null,
  };
};

export const buildProjectCancellationTargetSnapshot = async (
  tx: AuditClient,
  cancellation: {
    id: string;
    project_id: string;
    reason?: string | null;
  }
) => {
  const project = await buildProjectTargetSnapshot(tx, cancellation.project_id);

  return {
    id: cancellation.id,
    type: AuditTargetType.PROJECT_CANCELLATION,
    name: project.name,
    refNo: project.refNo,
    project,
    reason: cancellation.reason ?? null,
  };
};

export const buildDelegationTargetSnapshot = async (
  tx: AuditClient,
  delegation: {
    id: string;
    delegator_id: string;
    delegatee_id: string;
    role: string | null;
    unit_id: string | null;
    start_date?: Date;
    end_date?: Date | null;
  }
) => {
  const [delegator, delegatee] = await Promise.all([
    tx.user.findUnique({
      where: { id: delegation.delegator_id },
      select: { id: true, full_name: true },
    }),
    tx.user.findUnique({
      where: { id: delegation.delegatee_id },
      select: { id: true, full_name: true },
    }),
  ]);

  const delegatorSnapshot = {
    id: delegation.delegator_id,
    name: delegator?.full_name ?? delegation.delegator_id,
  };
  const delegateeSnapshot = {
    id: delegation.delegatee_id,
    name: delegatee?.full_name ?? delegation.delegatee_id,
  };

  return {
    id: delegation.id,
    type: AuditTargetType.USER_DELEGATION,
    name: `${delegatorSnapshot.name} -> ${delegateeSnapshot.name}`,
    refNo: null,
    delegator: delegatorSnapshot,
    delegatee: delegateeSnapshot,
    role: delegation.role,
    unitId: delegation.unit_id,
    startDate: delegation.start_date?.toISOString() ?? null,
    endDate: delegation.end_date?.toISOString() ?? null,
  };
};

export const recordAuditEvent = async (
  tx: AuditClient,
  input: RecordAuditEventInput
) => {
  const actorId = getActorId(input.actor, input.actorId);
  const actorSnapshot =
    input.actorSnapshot ?? (await buildActorSnapshot(tx, input.actor, actorId));
  const diff = input.diff ?? [];
  const metadata = input.metadata ?? null;
  const search_text = buildAuditSearchText({
    ...input,
    actorSnapshot,
    diff,
    metadata,
  });

  return tx.auditEvent.create({
    data: {
      kind: input.kind,
      event_type: input.eventType,
      target_type: input.targetType,
      target_id: input.targetId,
      project_id: input.projectId ?? null,
      actor_id: actorId,
      actor_snapshot: toAuditJsonValue(actorSnapshot) ?? {},
      target_snapshot: toAuditJsonValue(input.targetSnapshot) ?? {},
      diff: toAuditJsonValue(diff),
      comment: input.comment ?? null,
      metadata: metadata ? toAuditJsonValue(metadata) : undefined,
      search_text,
      source_table: input.sourceTable ?? null,
      source_id: input.sourceId ?? null,
      occurred_at: input.occurredAt ?? new Date(),
    },
  });
};

export const createProjectHistoryAndAuditEvent = async (
  tx: AuditClient,
  input: CreateProjectHistoryAuditInput
) => {
  const changedBy =
    typeof input.changedBy === 'string' ? input.changedBy : input.changedBy.id;
  const history = await tx.projectHistory.create({
    data: {
      project_id: input.projectId,
      action: input.action,
      old_value: toAuditJsonValue(input.oldValue) ?? {},
      new_value: toAuditJsonValue(input.newValue) ?? {},
      comment: input.comment ?? null,
      changed_by: changedBy,
    },
  });

  await recordAuditEvent(tx, {
    kind: AuditLogType.PROJECT_HISTORY,
    eventType: actionToEventType[input.action],
    targetType: AuditTargetType.PROJECT,
    targetId: input.projectId,
    projectId: input.projectId,
    actor: typeof input.changedBy === 'string' ? null : input.changedBy,
    actorId: changedBy,
    targetSnapshot: await buildProjectTargetSnapshot(tx, input.projectId),
    diff: buildAuditDiff(input.oldValue, input.newValue),
    comment: input.comment ?? null,
    metadata: { action: input.action },
    sourceTable: 'project_histories',
    sourceId: history?.id ?? null,
    occurredAt: history?.changed_at ?? new Date(),
  });

  return history;
};

const buildActor = (snapshot: AuditEventJson): AuditActor | null => {
  const actor = asRecord(snapshot);
  const id = asString(actor.id);
  const name = asString(actor.name) ?? asString(actor.full_name);

  if (!id && !name) return null;

  return {
    id: id ?? '',
    name: name ?? id ?? 'Unknown user',
  };
};

const buildTarget = (
  event: Pick<AuditEvent, 'target_id' | 'target_type' | 'target_snapshot'>
): AuditTarget => {
  const snapshot = asRecord(event.target_snapshot);
  const projectSnapshot = asRecord(snapshot.project as AuditEventJson);

  return {
    id: asString(snapshot.id) ?? event.target_id,
    type:
      (asString(snapshot.type) as AuditTargetType | null) ?? event.target_type,
    name:
      asString(snapshot.name) ??
      asString(projectSnapshot.name) ??
      event.target_id,
    refNo: asString(snapshot.refNo) ?? asString(projectSnapshot.refNo),
  };
};

const buildWhere = (
  query: AuditLogsQuery,
  projectId?: string
): Prisma.AuditEventWhereInput => {
  const where: Prisma.AuditEventWhereInput = {};

  if (query.kind) where.kind = query.kind;
  if (query.eventType) where.event_type = query.eventType;
  if (query.actorId) where.actor_id = query.actorId;
  if (query.projectId || projectId)
    where.project_id = projectId ?? query.projectId;

  if (query.dateFrom || query.dateTo) {
    where.occurred_at = {
      gte: query.dateFrom,
      lte: query.dateTo,
    };
  }

  if (query.q?.trim()) {
    where.search_text = {
      contains: query.q.trim().toLowerCase(),
      mode: Prisma.QueryMode.insensitive,
    };
  }

  return where;
};

const mapAuditEvent = (event: AuditEvent): AuditLogItem => ({
  id: event.id,
  kind: event.kind,
  eventType: event.event_type,
  occurredAt: event.occurred_at.toISOString(),
  title: titleByEventType[event.event_type],
  description: event.comment ?? titleByEventType[event.event_type],
  actor: buildActor(event.actor_snapshot),
  target: buildTarget(event),
  details: {
    eventType: event.event_type,
    targetType: event.target_type,
    diff: event.diff,
    comment: event.comment,
    metadata: event.metadata,
    source: {
      table: event.source_table,
      id: event.source_id,
    },
  },
});

const queryAuditEvents = async (
  page: number,
  limit: number,
  query: AuditLogsQuery,
  projectId?: string
): Promise<AuditLogsResponse> => {
  const skip = (page - 1) * limit;
  const where = buildWhere(query, projectId);

  const [events, total] = await prisma.$transaction([
    prisma.auditEvent.findMany({
      where,
      skip,
      take: limit,
      orderBy: { occurred_at: 'desc' },
    }),
    prisma.auditEvent.count({ where }),
  ]);

  return {
    total,
    page,
    totalPages: Math.ceil(total / limit),
    pageSize: limit,
    data: events.map(mapAuditEvent),
  };
};

export const listAuditLogs = async (
  _user: AuthPayload,
  page: number,
  limit: number,
  query: AuditLogsQuery
): Promise<AuditLogsResponse> => queryAuditEvents(page, limit, query);

export const listProjectAuditLogs = async (
  user: AuthPayload,
  projectId: string,
  page: number,
  limit: number,
  query: AuditLogsQuery
): Promise<AuditLogsResponse> => {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { requesting_dept_id: true },
  });

  if (!project) {
    throw new NotFoundError('Project not found');
  }

  if (
    !haveSupplyPermission(user) &&
    !getDeptIdsForUser(user).includes(project.requesting_dept_id)
  ) {
    throw new ForbiddenError('You do not have access to this project');
  }

  return queryAuditEvents(page, limit, query, projectId);
};
