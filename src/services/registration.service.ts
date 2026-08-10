import {
  RegistrationStatus,
  AuditEventType,
  AuditLogType,
  AuditTargetType,
  Prisma,
  UserRole,
  RegisterType,
  RegistrationRequest,
} from '@prisma/client';
import { prisma } from '../config/prisma';
import { nowUtc } from '../lib/date';
import { AppError, BadRequestError, NotFoundError } from '../lib/errors';
import { assertDepartmentUnitScope } from '../lib/roles';
import {
  CreateRegistrationRequestDto,
  ListRegistrationRequestsQueryDto,
} from '../schemas/registration.schema';
import { AuthPayload } from '../types/auth.type';
import { recordAuditEvent } from './audit-log.service';
import { PaginatedRegistrationRequest } from '../types/registration.type';

const safeUserSelect = {
  id: true,
  username: true,
  email: true,
  full_name: true,
  register_type: true,
  created_at: true,
  role_updated_at: true,
  roles: {
    select: {
      role: true,
      dept_id: true,
      unit_id: true,
      department: { select: { id: true, name: true } },
      unit: { select: { id: true, name: true } },
    },
  },
};

const assertNoExistingUser = async (
  tx: Prisma.TransactionClient,
  username: string,
  email: string
) => {
  const existingUser = await tx.user.findFirst({
    where: { OR: [{ username }, { email }] },
    select: { id: true },
  });

  if (existingUser) {
    throw new AppError('Username or email already exists', 409);
  }
};

const lockRegistrationIdentity = async (
  tx: Prisma.TransactionClient,
  username: string,
  email: string
): Promise<void> => {
  const keys = [
    `account-registration:email:${email}`,
    `account-registration:username:${username}`,
  ].sort();

  for (const key of keys) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
  }
};

const requestTargetSnapshot = (request: {
  id: string;
  username: string;
  full_name: string;
  email: string;
  dept_id: string;
  unit_id: string;
  register_type: RegisterType;
  status: RegistrationStatus;
}) => ({
  id: request.id,
  type: AuditTargetType.REGISTRATION_REQUEST,
  name: request.full_name,
  refNo: request.username,
  email: request.email,
  departmentId: request.dept_id,
  unitId: request.unit_id,
  userType: request.register_type,
  status: request.status,
});

export const createRegistrationRequest = async (
  data: CreateRegistrationRequestDto
): Promise<RegistrationRequest> => {
  return await prisma.$transaction(async (tx) => {
    await lockRegistrationIdentity(tx, data.username, data.email);
    await assertDepartmentUnitScope(tx, {
      deptId: data.dept_id,
      unitId: data.unit_id,
    });
    await assertNoExistingUser(tx, data.username, data.email);

    const pendingRequest = await tx.registrationRequest.findFirst({
      where: {
        status: RegistrationStatus.PENDING,
        OR: [{ username: data.username }, { email: data.email }],
      },
      select: { id: true },
    });
    if (pendingRequest) {
      throw new AppError(
        'A matching registration request is already pending',
        409
      );
    }

    const request = await tx.registrationRequest.create({
      data: {
        username: data.username,
        email: data.email!,
        full_name: data.full_name,
        dept_id: data.dept_id,
        unit_id: data.unit_id,
        register_type: RegisterType.SSO,
      },
    });

    await recordAuditEvent(tx, {
      kind: AuditLogType.USER_MANAGEMENT,
      eventType: AuditEventType.REGISTRATION_REQUESTED,
      targetType: AuditTargetType.REGISTRATION_REQUEST,
      targetId: request.id,
      targetSnapshot: requestTargetSnapshot(request),
      diff: [
        {
          field: 'status',
          oldValue: null,
          newValue: RegistrationStatus.PENDING,
        },
      ],
      metadata: {
        username: request.username,
        email: request.email,
        userType: request.register_type,
      },
      sourceTable: 'registration_requests',
      sourceId: request.id,
      occurredAt: request.created_at,
    });

    return request;
  });
};

export const listRegistrationRequests = async (
  page: number,
  limit: number,
  query: ListRegistrationRequestsQueryDto
): Promise<PaginatedRegistrationRequest> => {
  const where: Prisma.RegistrationRequestWhereInput = query.status
    ? { status: query.status }
    : {};

  const [data, total] = await prisma.$transaction([
    prisma.registrationRequest.findMany({
      skip: (page - 1) * limit,
      take: limit,
      where,
      include: {
        department: { select: { id: true, name: true } },
        unit: { select: { id: true, name: true } },
      },
      orderBy: { created_at: 'desc' },
    }),
    prisma.registrationRequest.count({ where }),
  ]);

  return {
    total,
    page,
    pageSize: limit,
    totalPages: Math.ceil(total / limit),
    data: data as RegistrationRequest[],
  };
};

export const approveRegistrationRequest = async (
  actor: AuthPayload,
  requestId: string
) => {
  return await prisma.$transaction(async (tx) => {
    const request = await tx.registrationRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundError('Registration request not found');
    if (request.status !== RegistrationStatus.PENDING) {
      throw new BadRequestError(
        'Registration request has already been reviewed'
      );
    }

    await assertDepartmentUnitScope(tx, {
      deptId: request.dept_id,
      unitId: request.unit_id,
    });
    await assertNoExistingUser(tx, request.username, request.email);

    const user = await tx.user.create({
      data: {
        username: request.username,
        email: request.email,
        full_name: request.full_name,
        password: null,
        register_type: RegisterType.SSO,
        roles: {
          create: {
            role: UserRole.GUEST,
            dept_id: request.dept_id,
            unit_id: request.unit_id,
          },
        },
      },
      select: safeUserSelect,
    });

    const approved = await tx.registrationRequest.update({
      where: { id: request.id },
      data: {
        status: RegistrationStatus.APPROVED,
        reviewed_by: actor.id,
        reviewed_at: nowUtc(),
        created_user_id: user.id,
      },
    });

    await recordAuditEvent(tx, {
      kind: AuditLogType.USER_MANAGEMENT,
      eventType: AuditEventType.REGISTRATION_APPROVED,
      targetType: AuditTargetType.REGISTRATION_REQUEST,
      targetId: approved.id,
      actor,
      targetSnapshot: requestTargetSnapshot(approved),
      diff: [
        {
          field: 'status',
          oldValue: RegistrationStatus.PENDING,
          newValue: RegistrationStatus.APPROVED,
        },
        { field: 'created_user_id', oldValue: null, newValue: user.id },
      ],
      metadata: { createdUserId: user.id, userType: RegisterType.SSO },
      sourceTable: 'registration_requests',
      sourceId: approved.id,
      occurredAt: approved.reviewed_at ?? nowUtc(),
    });

    return user
  });
};

export const rejectRegistrationRequest = async (
  user: AuthPayload,
  requestId: string,
): Promise<RegistrationRequest> => {
  return await prisma.$transaction(async (tx) => {
    const request = await tx.registrationRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundError('Registration request not found');
    if (request.status !== RegistrationStatus.PENDING) {
      throw new BadRequestError(
        'Registration request has already been reviewed'
      );
    }

    const rejected = await tx.registrationRequest.update({
      where: { id: request.id },
      data: {
        status: RegistrationStatus.REJECTED,
        reviewed_by: user.id,
        reviewed_at: nowUtc(),
      },
    });

    await recordAuditEvent(tx, {
      kind: AuditLogType.USER_MANAGEMENT,
      eventType: AuditEventType.REGISTRATION_REJECTED,
      targetType: AuditTargetType.REGISTRATION_REQUEST,
      targetId: rejected.id,
      actor: user,
      targetSnapshot: requestTargetSnapshot(rejected),
      diff: [
        {
          field: 'status',
          oldValue: RegistrationStatus.PENDING,
          newValue: RegistrationStatus.REJECTED,
        },
      ],
      sourceTable: 'registration_requests',
      sourceId: rejected.id,
      occurredAt: rejected.reviewed_at ?? nowUtc(),
    });

    return rejected;
  });
};