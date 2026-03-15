import {
  ProjectStatus,
  LogActionType,
  UserRole,
  UnitResponsibleType,
} from '@prisma/client';
import { prisma } from '../config/prisma';
import { ForbiddenError, NotFoundError } from '../lib/errors';
import { haveSupplyPermission, getDeptIdsForUser } from '../lib/permissions';
import { AuthPayload } from '../types/auth.type';
import { PaginatedProjects, ProjectsListResponse } from '../types/project.type';

export const listProjects = async (
  user: AuthPayload,
  page: number,
  limit: number
): Promise<PaginatedProjects> => {
  const skip = (page - 1) * limit;
  let where = {};

  if (!haveSupplyPermission(user)) {
    where = { requesting_dept_id: { in: getDeptIdsForUser(user) } };
  }

  const [projects, total] = await prisma.$transaction([
    prisma.project.findMany({
      where,
      skip: skip,
      take: limit,
      orderBy: [{ receive_no: 'desc' }],
    }),
    prisma.project.count({ where }),
  ]);

  return {
    total,
    page,
    pageSize: limit,
    totalPages: Math.ceil(total / limit),
    data: projects,
  };
};

export const getById = async (user: AuthPayload, id: string): Promise<any> => {
  const haveAccess =
    haveSupplyPermission(user) ||
    (await prisma.project.count({
      where: {
        id,
        requesting_dept_id: { in: getDeptIdsForUser(user) },
      },
    })) > 0;

  if (!haveAccess) {
    throw new ForbiddenError('You do not have access to this project');
  }

  return await prisma.$transaction(async (tx) => {
    const projectData = await tx.project.findUnique({
      where: { id },
      include: {
        requesting_dept: {
          select: {
            id: true,
            name: true,
          },
        },
        requesting_unit: {
          select: {
            id: true,
            name: true,
          },
        },
        assignee_procurement: {
          select: {
            id: true,
            full_name: true,
          },
        },
        assignee_contract: {
          select: {
            id: true,
            full_name: true,
          },
        },
        creator: {
          select: {
            id: true,
            full_name: true,
          },
        },
        project_cancellation: {
          where: { is_active: true },
          include: {
            requester: { select: { id: true, full_name: true, roles: true } },
            approver: { select: { id: true, full_name: true, roles: true } },
          },
        },
      },
    });
    if (!projectData) {
      throw new NotFoundError('Project not found');
    }

    const project = {
      id: projectData.id,
      procurement_type: projectData.procurement_type,
      current_workflow_type: projectData.current_workflow_type,
      is_urgent: projectData.is_urgent,
      title: projectData.title,
      description: projectData.description,
      budget: projectData.budget,
      status: projectData.status,
      procurement_status: {
        status: projectData.procurement_status,
        step: projectData.procurement_step,
      },
      contract_status: {
        status: projectData.contract_status,
        step: projectData.contract_step,
      },
      receive_no: projectData.receive_no,
      less_no: projectData.less_no,
      pr_no: projectData.pr_no,
      po_no: projectData.po_no,
      contract_no: projectData.contract_no,
      migo_no: projectData.migo_no,
      expected_approval_date: projectData.expected_approval_date,
      created_at: projectData.created_at,
      updated_at: projectData.updated_at,
      vendor: {
        name: projectData.vendor_name,
        tax_id: projectData.vendor_tax_id,
        email: projectData.vendor_email,
      },
      requester: {
        dept_id: projectData.requesting_dept.id,
        dept_name: projectData.requesting_dept.name,
        unit_id: projectData.requesting_unit?.id ?? null,
        unit_name: projectData.requesting_unit?.name ?? null,
      },
      creator: {
        id: projectData.creator.id,
        full_name: projectData.creator.full_name,
      },
      assignee_procurement: projectData.assignee_procurement.map((u) => ({
        id: u.id,
        full_name: u.full_name,
      })),
      assignee_contract: projectData.assignee_contract.map((u) => ({
        id: u.id,
        full_name: u.full_name,
      })),
      cancellation: projectData.project_cancellation
        ? projectData.project_cancellation.map((c) => ({
            reason: c.reason,
            is_cancelled: c.is_cancelled,
            requester: c.requester,
            approver: c.approver,
            requested_at: c.requested_at,
            approved_at: c.approved_at,
          }))
        : null,
    };

    return project;
  });
};

export const getUnassignedProjectsByUnit = async (
  user: AuthPayload
): Promise<ProjectsListResponse> => {
  const unitIds = user.roles
    .map((r) => r.unit_id)
    .filter((id): id is string => Boolean(id));
  if (unitIds.length === 0) {
    throw new NotFoundError('Unit not found');
  }

  const units = await prisma.unit.findMany({
    where: {
      id: {
        in: unitIds,
      },
    },
    select: { type: true },
  });
  if (units.length === 0) {
    throw new NotFoundError('Unit not found');
  }
  const where: any = {
    status: { in: [ProjectStatus.UNASSIGNED] },
    current_workflow_type: {
      in: units.flatMap((unit) => unit.type),
    },
  };

  const [projects, total] = await prisma.$transaction([
    prisma.project.findMany({
      where: where,
      orderBy: [{ status: 'asc' }, { receive_no: 'desc' }],
      select: {
        id: true,
        receive_no: true,
        title: true,
        status: true,
        requesting_unit: {
          select: {
            name: true,
            department: { select: { name: true, id: true } },
          },
        },
        budget: true,
        procurement_type: true,
        current_workflow_type: true,
        is_urgent: true,
        expected_approval_date: true,
        created_at: true,
      },
    }),
    prisma.project.count({ where }),
  ]);

  return {
    total,
    data: projects,
  };
};

export const getAssignedProjects = async (
  user: AuthPayload,
  targetDate: Date
): Promise<ProjectsListResponse> => {
  const startOfDay = new Date(targetDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(targetDate);
  endOfDay.setHours(23, 59, 59, 999);

  let where: any = {
    AND: [
      {
        OR: [
          {
            status: {
              in: [ProjectStatus.WAITING_ACCEPT],
            },
          },
          {
            project_histories: {
              some: {
                AND: [
                  {
                    OR: [
                      { action: LogActionType.STATUS_UPDATE },
                      { action: LogActionType.ASSIGNEE_UPDATE },
                    ],
                  },
                  { changed_at: { gte: startOfDay, lte: endOfDay } },
                  {
                    OR: [
                      {
                        new_value: {
                          path: ['status'],
                          equals: ProjectStatus.IN_PROGRESS,
                        },
                      },
                      {
                        new_value: {
                          path: ['status'],
                          equals: ProjectStatus.WAITING_CANCEL,
                        },
                      },
                      {
                        new_value: {
                          path: ['status'],
                          equals: ProjectStatus.CANCELLED,
                        },
                      },
                    ],
                  },
                ],
              },
            },
          },
        ],
      },
    ],
  };

  if (user.roles.some((r) => r.role === UserRole.HEAD_OF_UNIT)) {
    const unitIds = user.roles
      .map((r) => r.unit_id)
      .filter((id): id is string => Boolean(id));
    if (unitIds.length === 0) {
      throw new NotFoundError('Unit not found');
    }

    const unit = await prisma.unit.findMany({
      where: {
        id: {
          in: unitIds,
        },
      },
      select: { type: true },
    });
    if (unit.length === 0) {
      throw new NotFoundError('Unit not found');
    }

    where.AND.push({
      current_workflow_type: {
        in: unit.flatMap((u) => u.type),
      },
    });
  } else if (user.roles.some((r) => r.role === UserRole.GENERAL_STAFF)) {
    where.AND.push({
      OR: [
        { assignee_procurement: { some: { id: user.id } } },
        { assignee_contract: { some: { id: user.id } } },
      ],
    });
  }

  const [projects, total] = await prisma.$transaction([
    prisma.project.findMany({
      where: where,
      orderBy: [{ status: 'asc' }, { receive_no: 'desc' }],
      select: {
        id: true,
        receive_no: true,
        title: true,
        status: true,
        requesting_unit: {
          select: {
            name: true,
            department: { select: { name: true, id: true } },
          },
        },
        budget: true,
        procurement_type: true,
        current_workflow_type: true,
        assignee_procurement: { select: { id: true, full_name: true } },
        assignee_contract: { select: { id: true, full_name: true } },
        is_urgent: true,
        expected_approval_date: true,
        created_at: true,
        updated_at: true,
      },
    }),
    prisma.project.count({ where }),
  ]);

  return {
    total,
    data: projects.map((project) => {
      const assigneeField =
        project.current_workflow_type === UnitResponsibleType.CONTRACT
          ? 'assignee_contract'
          : 'assignee_procurement';
      const assignee = (project as any)[assigneeField];
      return {
        ...project,
        assignee: assignee.map((u: any) => ({
          id: u.id,
          full_name: u.full_name,
        })),
        assignee_procurement: undefined,
        assignee_contract: undefined,
      };
    }),
  };
};
