import { prisma } from '../config/prisma';
import {
  LogActionType,
  Prisma,
  ProjectPhaseStatus,
  ProjectStatus,
  UnitResponsibleType,
  UserRole,
} from '@prisma/client';
import {
  AcceptProjectsDto,
  CancelProjectDto,
  CreateProjectDto,
  PaginatedProjects,
  ProjectsListResponse,
  UpdateProjectDto,
  UpdateStatusProjectDto,
  UpdateStatusProjectsDto,
} from '../models/Project';
import { BadRequestError, ForbiddenError, NotFoundError } from '../lib/errors';
import { AuthPayload } from '../lib/types';
import { getDeptIdsForUser, haveSupplyPermission } from '../lib/permissions';
import { CONTRACT_UNIT_ID } from '../lib/constant';

const getReceiveNumber = async (
  tx: Prisma.TransactionClient,
  budget_year?: number
) => {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('project_creation_lock'))`;
  const count = await tx.project.count();
  budget_year = 2569;
  const format = budget_year
    .toString()
    .concat('/')
    .concat((count + 1).toString().padStart(5, '0'));

  return format;
};

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

export const createProject = async (
  user: AuthPayload,
  data: CreateProjectDto
): Promise<any> => {
  return await prisma.$transaction(async (tx) => {
    const responsibleUnit = await tx.unit.findFirst({
      where: { type: { has: data.procurement_type } },
      select: { id: true },
    });
    if (!responsibleUnit) {
      throw new NotFoundError('Responsible unit not found');
    }
    const receiveNumber = await getReceiveNumber(tx);

    return await tx.project.create({
      data: {
        ...data,
        status: ProjectStatus.UNASSIGNED,
        current_workflow_type: data.procurement_type,
        responsible_unit_id: responsibleUnit.id,
        receive_no: receiveNumber,
        created_by: user.id,
      },
    });
  });
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
        status: projectData.procurement_phase_status,
        step: projectData.procurement_step,
      },
      contract_status: {
        status: projectData.contract_phase_status,
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
                    new_value: {
                      path: ['status'],
                      equals: ProjectStatus.IN_PROGRESS,
                    },
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

export const assignProjectsToUser = async (
  user: AuthPayload,
  data: UpdateStatusProjectsDto
) => {
  return await prisma.$transaction(async (tx) => {
    const projectIds = data.map((d) => d.id);
    const assigneeIds = [...new Set(data.map((d) => d.userId))];

    const projects = await tx.project.findMany({
      where: { id: { in: projectIds } },
      select: {
        id: true,
        status: true,
        current_workflow_type: true,
        assignee_contract: true,
        assignee_procurement: true,
      },
    });

    const assignees = await tx.user.findMany({
      where: { id: { in: assigneeIds } },
      select: { id: true, full_name: true },
    });

    const projectMap = new Map(projects.map((p) => [p.id, p]));
    const assigneeMap = new Map(assignees.map((a) => [a.id, a]));

    const updatePromises = [];
    const historyPromises = [];

    for (const item of data) {
      const { id, userId: assigneeId } = item;
      const project = projectMap.get(id);
      const assignee = assigneeMap.get(assigneeId);

      if (!project) throw new NotFoundError(`Project ${id} not found`);
      if (!assignee)
        throw new NotFoundError(`Assignee ${assigneeId} not found`);
      if (project.status !== ProjectStatus.UNASSIGNED) {
        throw new BadRequestError(`Project ${id} is not unassigned`);
      }

      const assigneeField =
        project.current_workflow_type === UnitResponsibleType.CONTRACT
          ? 'assignee_contract'
          : 'assignee_procurement';

      if ((project as any)[assigneeField].length > 0) {
        throw new BadRequestError(`Project ${id} is already assigned`);
      }

      updatePromises.push(
        tx.project.update({
          where: {
            id,
            status: ProjectStatus.UNASSIGNED,
            [assigneeField]: { none: {} },
          },
          data: {
            status: ProjectStatus.WAITING_ACCEPT,
            [assigneeField]: { connect: { id: assigneeId } },
          },
          select: { id: true, status: true, [assigneeField]: true },
        })
      );

      historyPromises.push(
        tx.projectHistory.create({
          data: {
            project_id: id,
            action: LogActionType.ASSIGNEE_UPDATE,
            old_value: { status: project.status, [assigneeField]: [] },
            new_value: {
              status: ProjectStatus.WAITING_ACCEPT,
              [assigneeField]: [assigneeId],
            },
            changed_by: user.id,
          },
        })
      );
    }

    const updatedProjects = await Promise.all(updatePromises);
    await Promise.all(historyPromises);

    return { data: updatedProjects };
  });
};

export const changeAssignee = async (
  user: AuthPayload,
  data: UpdateStatusProjectDto
) => {
  const { id, userId: newAssigneeId } = data;
  return await prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id },
      select: {
        status: true,
        current_workflow_type: true,
        assignee_contract: true,
        assignee_procurement: true,
      },
    });
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    if (project.status !== ProjectStatus.WAITING_ACCEPT) {
      throw new BadRequestError(
        'Assignee can only be changed when project is in WAITING_ACCEPT status'
      );
    }
    const assigneeField =
      project.current_workflow_type === UnitResponsibleType.CONTRACT
        ? 'assignee_contract'
        : 'assignee_procurement';

    const oldAssigneeId = (project as any)[assigneeField]?.[0]?.id;
    const newAssignee = await tx.user.findUnique({
      where: { id: newAssigneeId },
      select: { id: true, full_name: true },
    });
    if (!newAssignee) {
      throw new NotFoundError(`New assignee ${newAssigneeId} not found`);
    }

    const updated = await tx.project.update({
      where: { id },
      data: {
        [assigneeField]: {
          disconnect: { id: oldAssigneeId },
          connect: { id: newAssigneeId },
        },
      },
      select: { id: true, status: true, [assigneeField]: true },
    });
    await tx.projectHistory.create({
      data: {
        project_id: id,
        action: LogActionType.ASSIGNEE_UPDATE,
        old_value: {
          [assigneeField]: [(project as any)[assigneeField]?.[0]?.id],
        },
        new_value: { [assigneeField]: [newAssigneeId] },
        changed_by: user.id,
      },
    });
    return { data: updated };
  });
};

export const claimProject = async (user: AuthPayload, projectId: string) => {
  return await prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: {
        status: true,
        current_workflow_type: true,
      },
    });

    if (!project) {
      throw new NotFoundError('Project not found');
    }
    const assigneeField =
      project.current_workflow_type === UnitResponsibleType.CONTRACT
        ? 'assignee_contract'
        : 'assignee_procurement';

    if (project.status !== ProjectStatus.UNASSIGNED) {
      throw new BadRequestError('This project cannot be claimed');
    }

    const updated = await tx.project.update({
      where: {
        id: projectId,
        status: ProjectStatus.UNASSIGNED,
        [assigneeField]: { none: {} },
      },
      data: {
        status: ProjectStatus.IN_PROGRESS,
        [assigneeField]: { connect: { id: user.id } },
      },
      select: { id: true, status: true, [assigneeField]: true },
    });

    await tx.projectHistory.create({
      data: {
        project_id: projectId,
        action: LogActionType.ASSIGNEE_UPDATE,
        old_value: { status: project.status, [assigneeField]: [] },
        new_value: { status: updated.status, [assigneeField]: [user.id] },
        changed_by: user.id,
      },
    });

    return { data: updated };
  });
};

export const acceptProjects = async (
  user: AuthPayload,
  data: AcceptProjectsDto
) => {
  return await prisma.$transaction(async (tx) => {
    const projects = await tx.project.findMany({
      where: { id: { in: data.id } },
      select: {
        id: true,
        status: true,
        assignee_procurement: true,
        assignee_contract: true,
        current_workflow_type: true,
      },
    });

    if (projects.length !== data.id.length) {
      throw new NotFoundError('One or more projects not found');
    }

    const updatePromises = [];
    const historyPromises = [];

    for (const project of projects) {
      const assigneeField =
        project.current_workflow_type === UnitResponsibleType.CONTRACT
          ? 'assignee_contract'
          : 'assignee_procurement';

      if (project[assigneeField]?.some((u) => u.id === user.id) === false) {
        throw new BadRequestError(
          `You are not the assignee of project ${project.id}`
        );
      }

      if (project.status !== ProjectStatus.WAITING_ACCEPT) {
        throw new BadRequestError(
          `Project ${project.id} is not in WAITING_ACCEPT status`
        );
      }

      updatePromises.push(
        tx.project.update({
          where: { id: project.id, status: ProjectStatus.WAITING_ACCEPT },
          data: { status: ProjectStatus.IN_PROGRESS },
          select: { id: true, status: true },
        })
      );

      historyPromises.push(
        tx.projectHistory.create({
          data: {
            project_id: project.id,
            action: LogActionType.STATUS_UPDATE,
            old_value: { status: ProjectStatus.WAITING_ACCEPT },
            new_value: { status: ProjectStatus.IN_PROGRESS },
            changed_by: user.id,
          },
        })
      );
    }

    const updatedProjects = await Promise.all(updatePromises);
    await Promise.all(historyPromises);

    return { data: updatedProjects };
  });
};

export const addAssignee = async (
  user: AuthPayload,
  data: UpdateStatusProjectDto
) => {
  return await prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: data.id },
      select: {
        assignee_contract: true,
        assignee_procurement: true,
        current_workflow_type: true,
        _count: {
          select: { assignee_contract: true, assignee_procurement: true },
        },
      },
    });
    if (!project) {
      throw new NotFoundError('Project not found');
    }
    const assigneeField =
      project.current_workflow_type === UnitResponsibleType.CONTRACT
        ? 'assignee_contract'
        : 'assignee_procurement';

    if (project._count[assigneeField] >= 2) {
      throw new BadRequestError(
        'Maximum number of assignees reached for this project'
      );
    }

    if (project[assigneeField].some((u) => u.id === data.userId)) {
      throw new BadRequestError('User is already an assignee of this project');
    }
    const assignee = await tx.user.findUnique({
      where: { id: data.userId },
      select: { id: true, full_name: true },
    });
    if (!assignee) {
      throw new NotFoundError(`Assignee ${data.userId} not found`);
    }

    const updated = await tx.project.update({
      where: { id: data.id, [assigneeField]: { none: { id: data.userId } } },
      data: {
        [assigneeField]: {
          connect: { id: data.userId },
        },
      },
      select: { id: true, status: true, [assigneeField]: true },
    });
    await tx.projectHistory.create({
      data: {
        project_id: data.id,
        action: LogActionType.ASSIGNEE_UPDATE,
        old_value: { [assigneeField]: project[assigneeField].map((u) => u.id) },
        new_value: { [assigneeField]: updated[assigneeField].map((u) => u.id) },
        changed_by: user.id,
      },
    });
    return { data: updated };
  });
};

export const returnProject = async (user: AuthPayload, projectId: string) => {
  return await prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: {
        status: true,
        current_workflow_type: true,
        _count: {
          select: {
            submissions: true,
          },
        },
      },
    });
    if (!project) {
      throw new NotFoundError('Project not found');
    }
    if (project.status !== ProjectStatus.IN_PROGRESS) {
      throw new BadRequestError('Only IN_PROGRESS projects can be returned');
    }
    if (project._count.submissions > 0) {
      throw new BadRequestError(
        'Cannot return project with existing submissions'
      );
    }

    const assigneeField =
      project.current_workflow_type === UnitResponsibleType.CONTRACT
        ? 'assignee_contract'
        : 'assignee_procurement';

    const updated = await tx.project.update({
      where: {
        id: projectId,
        status: ProjectStatus.IN_PROGRESS,
        [assigneeField]: { some: { id: user.id } },
      },
      data: {
        status: ProjectStatus.UNASSIGNED,
        [assigneeField]: {
          disconnect: { id: user.id },
        },
      },
      select: { id: true, status: true },
    });
    await tx.projectHistory.create({
      data: {
        project_id: projectId,
        action: LogActionType.ASSIGNEE_UPDATE,
        old_value: { status: project.status, [assigneeField]: [user.id] },
        new_value: { status: updated.status, [assigneeField]: [] },
        changed_by: user.id,
      },
    });
    return { data: updated };
  });
};

export const cancelProject = async (
  user: AuthPayload,
  data: CancelProjectDto
) => {
  return await prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: data.id },
      select: { status: true },
    });
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    const cancellation = await tx.projectCancellation.findFirst({
      where: { project_id: data.id, is_active: true },
    });
    if (cancellation) {
      throw new BadRequestError(
        'There is already an active cancellation request'
      );
    }

    const isHead =
      user.roles.some((r) => r.role === UserRole.HEAD_OF_UNIT) ||
      user.roles.some((r) => r.role === UserRole.HEAD_OF_DEPARTMENT);

    if (!isHead) {
      if (project.status === ProjectStatus.CANCELLED) {
        throw new BadRequestError('Project is already cancelled');
      }
      if (project.status === ProjectStatus.WAITING_CANCEL) {
        throw new BadRequestError('Cancellation is already requested');
      }

      const updated = await tx.project.update({
        where: { id: data.id },
        data: {
          status: ProjectStatus.WAITING_CANCEL,
        },
        select: { id: true, status: true },
      });

      await tx.projectHistory.create({
        data: {
          project_id: data.id,
          action: LogActionType.STATUS_UPDATE,
          old_value: { status: project.status },
          new_value: { status: updated.status },
          changed_by: user.id,
        },
      });

      const cancelled = await tx.projectCancellation.create({
        data: {
          project_id: data.id,
          reason: data.reason,
          is_active: true,
          is_cancelled: false,
          requested_by: user.id,
        },
        select: { project_id: true, reason: true, is_cancelled: true },
      });

      return { data: cancelled };
    }

    await tx.project.update({
      where: { id: data.id },
      data: {
        status: ProjectStatus.CANCELLED,
      },
    });

    await tx.projectHistory.create({
      data: {
        project_id: data.id,
        action: LogActionType.STATUS_UPDATE,
        old_value: { status: project.status },
        new_value: { status: ProjectStatus.CANCELLED },
        changed_by: user.id,
      },
    });

    const cancelled = await tx.projectCancellation.create({
      data: {
        project_id: data.id,
        reason: data.reason,
        is_active: true,
        is_cancelled: true,
        requested_by: user.id,
        approved_by: user.id,
      },
      select: { project_id: true, reason: true, is_cancelled: true },
    });

    return { data: cancelled };
  });
};

export const approveCancellation = async (
  user: AuthPayload,
  projectId: string
) => {
  return await prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: { status: true },
    });
    if (!project) {
      throw new NotFoundError('Project not found');
    }
    if (project.status !== ProjectStatus.WAITING_CANCEL) {
      throw new BadRequestError('Project is not in WAITING_CANCEL status');
    }
    const updated = await tx.project.update({
      where: { id: projectId },
      data: {
        status: ProjectStatus.CANCELLED,
      },
      select: { id: true, status: true },
    });

    await tx.projectCancellation.updateMany({
      where: { project_id: projectId },
      data: { is_cancelled: true },
    });

    await tx.projectHistory.create({
      data: {
        project_id: projectId,
        action: LogActionType.STATUS_UPDATE,
        old_value: { status: project.status },
        new_value: { status: updated.status },
        changed_by: user.id,
      },
    });
    return { data: updated };
  });
};

export const rejectCancellation = async (
  user: AuthPayload,
  projectId: string
) => {
  return await prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: { status: true },
    });
    if (!project) {
      throw new NotFoundError('Project not found');
    }
    if (project.status !== ProjectStatus.WAITING_CANCEL) {
      throw new BadRequestError('Project is not in WAITING_CANCEL status');
    }
    const updated = await tx.project.update({
      where: { id: projectId },
      data: {
        status: ProjectStatus.IN_PROGRESS,
      },
      select: { id: true, status: true },
    });

    await tx.projectCancellation.deleteMany({
      where: { project_id: projectId },
    });

    await tx.projectHistory.create({
      data: {
        project_id: projectId,
        action: LogActionType.STATUS_UPDATE,
        old_value: { status: project.status },
        new_value: { status: updated.status },
        changed_by: user.id,
      },
    });

    return { data: updated };
  });
};

export const completeProcurementPhase = async (
  user: AuthPayload,
  projectId: string
) => {
  return await prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: {
        status: true,
        current_workflow_type: true,
        procurement_phase_status: true,
        responsible_unit_id: true,
      },
    });
    if (!project) {
      throw new NotFoundError('Project not found');
    }
    if (project.status !== ProjectStatus.IN_PROGRESS) {
      throw new BadRequestError('Project is not in IN_PROGRESS status');
    }
    if (project.procurement_phase_status !== ProjectPhaseStatus.COMPLETED) {
      throw new BadRequestError('Procurement phase is not in COMPLETED status');
    }
    if (project.current_workflow_type === UnitResponsibleType.CONTRACT) {
      throw new BadRequestError('Project is already in CONTRACT workflow type');
    }

    const updated = await tx.project.update({
      where: { id: projectId },
      data: {
        status: ProjectStatus.UNASSIGNED,
        current_workflow_type: UnitResponsibleType.CONTRACT,
        responsible_unit_id: CONTRACT_UNIT_ID,
      },
      select: {
        id: true,
        status: true,
        current_workflow_type: true,
        responsible_unit_id: true,
      },
    });
    await tx.projectHistory.create({
      data: {
        project_id: projectId,
        action: LogActionType.STATUS_UPDATE,
        old_value: {
          status: project.status,
          current_workflow_type: project.current_workflow_type,
          responsible_unit_id: project.responsible_unit_id,
        },
        new_value: {
          status: ProjectStatus.UNASSIGNED,
          current_workflow_type: UnitResponsibleType.CONTRACT,
          responsible_unit_id: CONTRACT_UNIT_ID,
        },
        changed_by: user.id,
      },
    });
    return { data: updated };
  });
};

export const closeProject = async (user: AuthPayload, projectId: string) => {
  return await prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: {
        status: true,
        current_workflow_type: true,
        contract_phase_status: true,
      },
    });
    if (!project) {
      throw new NotFoundError('Project not found');
    }
    if (project.status !== ProjectStatus.IN_PROGRESS) {
      throw new BadRequestError('Project is not in IN_PROGRESS status');
    }
    if (project.contract_phase_status !== ProjectPhaseStatus.COMPLETED) {
      throw new BadRequestError('Contract phase is not in COMPLETED status');
    }
    if (project.current_workflow_type !== UnitResponsibleType.CONTRACT) {
      throw new BadRequestError('Project is not in CONTRACT workflow type');
    }

    const updated = await tx.project.update({
      where: { id: projectId },
      data: {
        status: ProjectStatus.CLOSED,
      },
      select: { id: true, status: true },
    });
    await tx.projectHistory.create({
      data: {
        project_id: projectId,
        action: LogActionType.STATUS_UPDATE,
        old_value: {
          status: project.status,
        },
        new_value: {
          status: ProjectStatus.CLOSED,
        },
        changed_by: user.id,
      },
    });

    return { data: updated };
  });
};

export const requestEditProject = async (
  user: AuthPayload,
  projectId: string
) => {
  return await prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: { status: true },
    });
    if (!project) {
      throw new NotFoundError('Project not found');
    }
    if (project.status !== ProjectStatus.CLOSED) {
      throw new BadRequestError('Project is not in CLOSED status');
    }

    const updated = await tx.project.update({
      where: { id: projectId },
      data: {
        status: ProjectStatus.REQUEST_EDIT,
      },
      select: { id: true, status: true },
    });

    await tx.projectHistory.create({
      data: {
        project_id: projectId,
        action: LogActionType.STATUS_UPDATE,
        old_value: { status: project.status },
        new_value: { status: updated.status },
        changed_by: user.id,
      },
    });
    return { data: updated };
  });
};

export const updateProjectData = async (
  user: AuthPayload,
  data: UpdateProjectDto
) => {
  if (!data || !data.updateData || Object.keys(data.updateData).length === 0) {
    throw new BadRequestError('No data provided for update');
  }
  return await prisma.$transaction(async (tx) => {
    const current = await tx.project.findUnique({
      where: { id: data.id },
    });
    if (!current) {
      throw new NotFoundError('Project not found');
    }
    const oldValue: any = {};
    Object.keys(data.updateData).forEach((key) => {
      oldValue[key] = (current as any)[key];
    });

    const updated = await tx.project.update({
      where: { id: data.id },
      data: { ...data.updateData },
    });

    await tx.projectHistory.create({
      data: {
        project_id: data.id,
        action: LogActionType.INFORMATION_UPDATE,
        old_value: { ...oldValue },
        new_value: { ...data.updateData },
        changed_by: user.id,
      },
    });

    return { data: updated };
  });
};

export const deleteProject = async (
  user: AuthPayload,
  id: string
): Promise<void> => {
  const project = await prisma.project.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!project) {
    throw new NotFoundError('Project not found');
  }
  await prisma.project.delete({
    where: { id },
  });
};
