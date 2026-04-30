import {
  AuditLogType,
  ProjectActionType,
  ProjectCancellation,
  ProjectHistory,
  User,
  UserDelegation,
} from '@prisma/client';
import { prisma } from '../config/prisma';
import {
  AuditActor,
  AuditLogItem,
  AuditLogsResponse,
  AuditTarget,
} from '../types/audit-log.type';
import { AuthPayload } from '../types/auth.type';
import { AuditLogsQuery } from '../schemas/admin.schema';

type BasicUser = Pick<User, 'id' | 'full_name'>;
type BasicProject = {
  id: string;
  title: string;
  receive_no: string;
};

type ProjectHistoryWithProject = ProjectHistory & {
  project: BasicProject;
};

type ProjectCancellationWithRelations = ProjectCancellation & {
  project: BasicProject;
  requester: BasicUser;
  approver: BasicUser | null;
};

type UserDelegationWithRelations = UserDelegation & {
  delegator: BasicUser;
  delegatee: BasicUser;
  creator: BasicUser;
  canceller?: BasicUser | null;
};

const toIsoStringOrNull = (date: Date | null) => date?.toISOString() ?? null;

const buildActor = (user: BasicUser | null | undefined): AuditActor | null =>
  user ? { id: user.id, name: user.full_name } : null;

const buildProjectTarget = (project: BasicProject): AuditTarget => ({
  id: project.id,
  type: 'PROJECT',
  name: project.title,
  refNo: project.receive_no,
});

const matchesSearch = (item: AuditLogItem, query?: string) => {
  if (!query) return true;

  const q = query.toLowerCase();
  const searchableValues = [
    item.id,
    item.kind,
    item.occurredAt,
    item.title,
    item.description,
    item.actor?.id,
    item.actor?.name,
    item.target.id,
    item.target.type,
    item.target.name,
    item.target.refNo,
    JSON.stringify(item.details),
  ];

  return searchableValues.some((value) => value?.toLowerCase().includes(q));
};

const mapProjectHistory = (
  history: ProjectHistoryWithProject,
  actorMap: Map<string, BasicUser>
): AuditLogItem => {
  const titleByAction: Record<ProjectActionType, string> = {
    [ProjectActionType.INFORMATION_UPDATE]: 'Project information updated',
    [ProjectActionType.ASSIGNEE_UPDATE]: 'Project assignee updated',
    [ProjectActionType.STATUS_UPDATE]: 'Project status updated',
    [ProjectActionType.STEP_UPDATE]: 'Project step updated',
  };

  return {
    id: history.id,
    kind: AuditLogType.PROJECT_HISTORY,
    occurredAt: history.changed_at.toISOString(),
    title: titleByAction[history.action],
    description: history.comment ?? 'Project updated',
    actor: buildActor(actorMap.get(history.changed_by)),
    target: buildProjectTarget(history.project),
    details: {
      action: history.action,
      oldValue: history.old_value,
      newValue: history.new_value,
      comment: history.comment,
    },
  };
};

const mapProjectCancellation = (
  cancellation: ProjectCancellationWithRelations
): AuditLogItem => {
  const latestStateAt =
    cancellation.cancelled_at ??
    cancellation.approved_at ??
    cancellation.requested_at;
  const hasApprovalState =
    cancellation.is_cancelled ||
    cancellation.approved_at !== null ||
    cancellation.cancelled_at !== null;
  const actor = hasApprovalState
    ? buildActor(cancellation.approver ?? cancellation.requester)
    : buildActor(cancellation.requester);

  return {
    id: cancellation.id,
    kind: AuditLogType.PROJECT_CANCELLATION,
    occurredAt: latestStateAt.toISOString(),
    title: hasApprovalState
      ? 'Project cancellation approved'
      : 'Project cancellation requested',
    description: cancellation.reason,
    actor,
    target: buildProjectTarget(cancellation.project),
    details: {
      reason: cancellation.reason,
      isActive: cancellation.is_active,
      isCancelled: cancellation.is_cancelled,
      requestedBy: cancellation.requester.full_name,
      requestedAt: cancellation.requested_at.toISOString(),
      approvedBy: cancellation.approver?.full_name ?? null,
      approvedAt: toIsoStringOrNull(cancellation.approved_at),
      cancelledAt: toIsoStringOrNull(cancellation.cancelled_at),
    },
  };
};

const mapUserDelegation = (
  delegation: UserDelegationWithRelations
): AuditLogItem[] => {
  const wasCancelled = delegation.cancelled_at !== null;
  const delegator = buildActor(delegation.delegator)!;
  const delegatee = buildActor(delegation.delegatee)!;
  const creator = buildActor(delegation.creator)!;
  const canceller = buildActor(delegation.canceller ?? null);

  const commonTarget: AuditTarget = {
    id: delegation.id,
    type: 'USER_DELEGATION',
    name: `${delegator.name} -> ${delegatee.name}`,
    refNo: null,
  };

  const commonDetails = {
    delegator,
    delegatee,
    startDate: delegation.start_date.toISOString(),
    endDate: toIsoStringOrNull(delegation.end_date),
    isActive: delegation.is_active,
    cancelledAt: toIsoStringOrNull(delegation.cancelled_at),
    createdBy: delegation.creator.full_name,
    cancelledBy: delegation.canceller?.full_name ?? null,
  };

  const createdDescription =
    delegation.creator.id === delegation.delegator_id
      ? `${delegator.name} delegated access to ${delegatee.name}`
      : `${delegation.creator.full_name} created delegation for ${delegator.name} to ${delegatee.name}`;

  const createdLog: AuditLogItem = {
    id: `${delegation.id}:created`,
    kind: AuditLogType.USER_DELEGATION,
    occurredAt: delegation.created_at.toISOString(),
    title: 'User delegation created',
    description: createdDescription,
    actor: creator,
    target: commonTarget,
    details: {
      ...commonDetails,
      event: 'CREATED',
    },
  };

  const cancellationLog: AuditLogItem | null = wasCancelled
    ? {
        id: `${delegation.id}:cancelled`,
        kind: AuditLogType.USER_DELEGATION,
        occurredAt: delegation.cancelled_at!.toISOString(),
        title: 'User delegation cancelled',
        description: delegation.canceller
          ? delegation.canceller.id === delegation.delegator_id
            ? `${delegator.name} cancelled delegation to ${delegatee.name}`
            : `${delegation.canceller!.full_name} cancelled delegation for ${delegator.name} to ${delegatee.name}`
          : `${delegator.name} cancelled delegation to ${delegatee.name}`,
        actor: canceller ?? null,
        target: commonTarget,
        details: {
          ...commonDetails,
          event: 'CANCELLED',
        },
      }
    : null;

  return cancellationLog ? [createdLog, cancellationLog] : [createdLog];
};

export const listAuditLogs = async (
  _user: AuthPayload,
  page: number,
  limit: number,
  query: AuditLogsQuery
): Promise<AuditLogsResponse> => {
  const skip = (page - 1) * limit;
  const shouldFetchProjectHistory =
    !query.kind || query.kind === AuditLogType.PROJECT_HISTORY;
  const shouldFetchProjectCancellation =
    !query.kind || query.kind === AuditLogType.PROJECT_CANCELLATION;
  const shouldFetchUserDelegation =
    !query.kind || query.kind === AuditLogType.USER_DELEGATION;

  const [projectHistories, projectCancellations, userDelegations] =
    await Promise.all([
      shouldFetchProjectHistory
        ? prisma.projectHistory.findMany({
            where: {
              changed_at: {
                gte: query.dateFrom ?? undefined,
                lte: query.dateTo ?? new Date(),
              },
            },
            skip,
            take: limit,
            include: {
              project: {
                select: { id: true, title: true, receive_no: true },
              },
            },
          })
        : Promise.resolve([]),
      shouldFetchProjectCancellation
        ? prisma.projectCancellation.findMany({
            where: {
              OR: [
                {
                  requested_at: {
                    gte: query.dateFrom ?? undefined,
                    lte: query.dateTo ?? new Date(),
                  },
                },
                {
                  approved_at: {
                    gte: query.dateFrom ?? undefined,
                    lte: query.dateTo ?? new Date(),
                  },
                },
                {
                  cancelled_at: {
                    gte: query.dateFrom ?? undefined,
                    lte: query.dateTo ?? new Date(),
                  },
                },
              ],
            },
            skip,
            take: limit,
            include: {
              project: {
                select: { id: true, title: true, receive_no: true },
              },
              requester: { select: { id: true, full_name: true } },
              approver: { select: { id: true, full_name: true } },
            },
          })
        : Promise.resolve([]),
      shouldFetchUserDelegation
        ? prisma.userDelegation.findMany({
            where: {
              OR: [
                {
                  created_at: {
                    gte: query.dateFrom ?? undefined,
                    lte: query.dateTo ?? new Date(),
                  },
                },
                {
                  cancelled_at: {
                    gte: query.dateFrom ?? undefined,
                    lte: query.dateTo ?? new Date(),
                  },
                },
              ],
            },
            skip,
            take: limit,
            include: {
              delegator: { select: { id: true, full_name: true } },
              delegatee: { select: { id: true, full_name: true } },
              creator: { select: { id: true, full_name: true } },
              canceller: { select: { id: true, full_name: true } },
            },
          })
        : Promise.resolve([]),
    ]);

  const actorIds = [
    ...new Set(projectHistories.map((history) => history.changed_by)),
  ];
  const actors =
    actorIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, full_name: true },
        })
      : [];
  const actorMap = new Map(actors.map((actor) => [actor.id, actor]));

  const searchQuery = query.q?.trim();

  const allLogs = [
    ...projectHistories.map((history) => mapProjectHistory(history, actorMap)),
    ...projectCancellations.map(mapProjectCancellation),
    ...userDelegations.flatMap(mapUserDelegation),
  ]
    .filter((item) => matchesSearch(item, searchQuery))
    .sort(
      (a, b) =>
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
    );

  const pagedLogs = allLogs.slice(skip, skip + limit);

  return {
    total: allLogs.length,
    page,
    totalPages: Math.ceil(allLogs.length / limit),
    pageSize: limit,
    data: pagedLogs,
  };
};
