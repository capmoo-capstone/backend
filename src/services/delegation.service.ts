import {
  AuditEventType,
  AuditLogType,
  AuditTargetType,
  UserDelegation,
  UserRole,
} from '@prisma/client';
import { prisma } from '../config/prisma';
import { OPS_DEPT_ID } from '../lib/constant';
import { BadRequestError, NotFoundError } from '../lib/errors';
import { AddDelegationDto } from '../schemas/delegation.schema';
import { AuthPayload } from '../types/auth.type';
import { DelegationDetail } from '../types/delegation.type';
import {
  buildDelegationTargetSnapshot,
  recordAuditEvent,
} from './audit-log.service';
import * as UserService from './user.service';

type DelegableRole =
  | typeof UserRole.HEAD_OF_DEPARTMENT
  | typeof UserRole.HEAD_OF_UNIT;

const activeDelegationWhere = () => ({
  is_active: true,
  OR: [{ end_date: { equals: null } }, { end_date: { gte: new Date() } }],
});

const assertValidDelegationScope = (data: AddDelegationDto) => {
  if (data.role === UserRole.HEAD_OF_UNIT && !data.unit_id) {
    throw new BadRequestError('unit_id is required for HEAD_OF_UNIT');
  }

  if (data.role === UserRole.HEAD_OF_DEPARTMENT && data.unit_id) {
    throw new BadRequestError('unit_id is not allowed for HEAD_OF_DEPARTMENT');
  }
};

export const addDelegation = async (
  user: AuthPayload,
  data: AddDelegationDto
): Promise<UserDelegation> => {
  assertValidDelegationScope(data);

  await Promise.all([
    UserService.getById(data.delegator_id),
    UserService.getById(data.delegatee_id),
  ]);
  return await prisma.$transaction(async (tx) => {
    const scopeKey = `delegation:${data.delegator_id}:${data.role}:${data.unit_id ?? 'null'}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${scopeKey}))`;

    const delegatedRole = await tx.userOrganizationRole.findFirst({
      where: {
        user_id: data.delegator_id,
        role: data.role,
        dept_id: OPS_DEPT_ID,
        unit_id: data.unit_id ?? null,
      },
      select: { id: true },
    });

    if (!delegatedRole) {
      throw new BadRequestError(
        'Delegator does not have the specified role scope.'
      );
    }

    const validExisting = await tx.userDelegation.findFirst({
      where: {
        delegator_id: data.delegator_id,
        role: data.role,
        unit_id: data.unit_id ?? null,
        ...activeDelegationWhere(),
      },
    });
    if (validExisting) {
      throw new BadRequestError(
        'An active delegation already exists for this role scope.'
      );
    }
    const created = await tx.userDelegation.create({
      data: {
        delegator_id: data.delegator_id,
        delegatee_id: data.delegatee_id,
        role: data.role,
        unit_id: data.unit_id ?? null,
        start_date: data.start_date,
        end_date: data.end_date ?? undefined,
        is_active: true,
        created_by: user.id,
      },
    });

    await tx.user.update({
      where: { id: data.delegatee_id },
      data: { role_updated_at: new Date() },
    });

    await recordAuditEvent(tx, {
      kind: AuditLogType.USER_DELEGATION,
      eventType: AuditEventType.USER_DELEGATION_CREATED,
      targetType: AuditTargetType.USER_DELEGATION,
      targetId: created.id,
      actor: user,
      targetSnapshot: await buildDelegationTargetSnapshot(tx, created),
      diff: [
        {
          field: 'delegation.is_active',
          oldValue: null,
          newValue: true,
        },
      ],
      metadata: {
        role: created.role,
        unitId: created.unit_id,
        delegatorId: created.delegator_id,
        delegateeId: created.delegatee_id,
        startDate: created.start_date,
        endDate: created.end_date,
      },
      sourceTable: 'user_delegations',
      sourceId: created.id,
      occurredAt: created.created_at,
    });

    return created;
  });
};

export const cancelDelegation = async (
  user: AuthPayload,
  id: string
): Promise<UserDelegation> => {
  return await prisma.$transaction(async (tx) => {
    const delegation = await tx.userDelegation.findUnique({
      where: { id },
    });
    if (!delegation) {
      throw new NotFoundError('Delegation not found');
    }
    if (!delegation.is_active || delegation.cancelled_at) {
      throw new BadRequestError('Delegation is already cancelled');
    }

    const updated = await tx.userDelegation.update({
      where: { id },
      data: {
        is_active: false,
        cancelled_at: new Date(),
        cancelled_by: user.id,
      },
    });

    await tx.user.update({
      where: { id: updated.delegatee_id },
      data: { role_updated_at: new Date() },
    });

    await recordAuditEvent(tx, {
      kind: AuditLogType.USER_DELEGATION,
      eventType: AuditEventType.USER_DELEGATION_CANCELLED,
      targetType: AuditTargetType.USER_DELEGATION,
      targetId: updated.id,
      actor: user,
      targetSnapshot: await buildDelegationTargetSnapshot(tx, updated),
      diff: [
        {
          field: 'delegation.is_active',
          oldValue: delegation.is_active,
          newValue: updated.is_active,
        },
      ],
      metadata: {
        role: updated.role,
        unitId: updated.unit_id,
        delegatorId: updated.delegator_id,
        delegateeId: updated.delegatee_id,
        cancelledAt: updated.cancelled_at,
      },
      sourceTable: 'user_delegations',
      sourceId: updated.id,
      occurredAt: updated.cancelled_at ?? new Date(),
    });

    return updated;
  });
};

export const getById = async (id: string): Promise<DelegationDetail> => {
  const delegation = await prisma.userDelegation.findUnique({
    where: { id },
    include: {
      delegator: {
        select: {
          id: true,
          full_name: true,
        },
      },
      delegatee: {
        select: {
          id: true,
          full_name: true,
        },
      },
    },
  });

  if (!delegation) {
    throw new NotFoundError('Delegation not found');
  }

  return delegation;
};

export const getActiveDelegation = async (
  role: DelegableRole,
  unitId?: string
): Promise<DelegationDetail | null> => {
  if (role === UserRole.HEAD_OF_UNIT && !unitId) {
    throw new BadRequestError('unitId is required for HEAD_OF_UNIT');
  }

  const delegation = await prisma.userDelegation.findFirst({
    where: {
      role,
      unit_id: role === UserRole.HEAD_OF_UNIT ? unitId : null,
      ...activeDelegationWhere(),
    },
    include: {
      delegator: {
        select: {
          id: true,
          full_name: true,
        },
      },
      delegatee: {
        select: {
          id: true,
          full_name: true,
        },
      },
    },
  });

  return delegation ?? null;
};
