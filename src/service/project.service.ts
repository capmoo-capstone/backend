import { prisma } from '../config/prisma';
import {
  LogActionType,
  ProjectStatus,
  ProjectPhaseStatus,
  SubmissionStatus,
  SubmissionType,
  UnitResponsibleType,
  Role,
  Prisma,
} from '@prisma/client';
import {
  AcceptProjectsDto,
  CancelProjectDto,
  CreateProjectDto,
  PaginatedProjects,
  PhaseStatusResult,
  ProjectsListResponse,
  UpdateProjectDto,
  UpdateStatusProjectDto,
  UpdateStatusProjectsDto,
} from '../models/Project';
import { BadRequestError, NotFoundError } from '../lib/errors';
import * as UserService from './user.service';
import { AuthPayload } from '../lib/types';

const mapSubmissionToPhaseStatus = (
  status: SubmissionStatus
): ProjectPhaseStatus => {
  switch (status) {
    case SubmissionStatus.WAITING_APPROVAL:
      return ProjectPhaseStatus.WAITING_APPROVAL;
    case SubmissionStatus.WAITING_PROPOSAL:
      return ProjectPhaseStatus.WAITING_PROPOSAL;
    case SubmissionStatus.WAITING_SIGNATURE:
      return ProjectPhaseStatus.WAITING_SIGNATURE;
    case SubmissionStatus.REJECTED:
      return ProjectPhaseStatus.REJECTED;
    case SubmissionStatus.COMPLETED:
      return ProjectPhaseStatus.COMPLETED;
    default:
      return ProjectPhaseStatus.IN_PROGRESS;
  }
};

const makeStepRange = (start: number, end: number): number[] => {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
};

const WORKFLOW_STEP_ORDERS: Record<UnitResponsibleType, number[]> = {
  [UnitResponsibleType.LT100K]: makeStepRange(1, 4),
  [UnitResponsibleType.LT500K]: makeStepRange(1, 4),
  [UnitResponsibleType.MT500K]: makeStepRange(1, 6),
  [UnitResponsibleType.SELECTION]: makeStepRange(1, 7),
  [UnitResponsibleType.EBIDDING]: makeStepRange(1, 10),
  [UnitResponsibleType.CONTRACT]: makeStepRange(1, 7),
};

const computePhaseStatus = async (
  projectId: string,
  workflowType: UnitResponsibleType,
  tx: Prisma.TransactionClient
): Promise<PhaseStatusResult> => {
  const stepOrders = WORKFLOW_STEP_ORDERS[workflowType] ?? [];
  const submissions = await tx.projectSubmission.findMany({
    where: {
      project_id: projectId,
      submission_type: SubmissionType.STAFF,
      workflow_type: workflowType,
    },
    orderBy: [{ step_order: 'asc' }, { submission_round: 'desc' }],
    select: { step_order: true, status: true },
  });

  const latestByStep = new Map<number, SubmissionStatus>();

  for (const s of submissions) {
    if (s.step_order !== null && !latestByStep.has(s.step_order)) {
      latestByStep.set(s.step_order, s.status as SubmissionStatus);
    }
  }

  for (const stepOrder of stepOrders) {
    if (latestByStep.get(stepOrder) === SubmissionStatus.REJECTED) {
      return { status: ProjectPhaseStatus.REJECTED, step: stepOrder };
    }
  }

  for (const stepOrder of stepOrders) {
    if (!latestByStep.has(stepOrder)) {
      return { status: ProjectPhaseStatus.IN_PROGRESS, step: stepOrder };
    }
  }

  for (const stepOrder of stepOrders) {
    const currentStatus = latestByStep.get(stepOrder);
    if (currentStatus !== SubmissionStatus.COMPLETED) {
      return {
        status: mapSubmissionToPhaseStatus(currentStatus as SubmissionStatus),
        step: stepOrder,
      };
    }
  }

  return { status: ProjectPhaseStatus.COMPLETED };
};

export const getWorkflowStatus = async (
  projectId: string,
  tx: Prisma.TransactionClient
) => {
  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: {
      procurement_type: true,
      current_workflow_type: true,
      assignee_procurement: true,
      assignee_contract: true,
    },
  });

  if (!project) throw new Error('Project not found');

  let procurement: PhaseStatusResult;
  let contract: PhaseStatusResult;

  if (project.assignee_procurement.length == 0) {
    procurement = { status: ProjectPhaseStatus.NOT_STARTED };
  } else
    procurement = await computePhaseStatus(
      projectId,
      project.procurement_type,
      tx
    );

  if (
    procurement.status !== ProjectPhaseStatus.COMPLETED ||
    project.current_workflow_type !== UnitResponsibleType.CONTRACT ||
    project.assignee_contract.length == 0
  ) {
    contract = { status: ProjectPhaseStatus.NOT_STARTED };
  } else
    contract = await computePhaseStatus(
      projectId,
      UnitResponsibleType.CONTRACT,
      tx
    );

  return { procurement, contract };
};

export const listProjects = async (
  user: AuthPayload,
  page: number,
  limit: number
): Promise<PaginatedProjects> => {
  const skip = (page - 1) * limit;
  const where: Prisma.ProjectWhereInput = {};

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
    const receiveNumber = ((await tx.project.count()) + 1).toString();

    return await tx.project.create({
      data: {
        ...data,
        status: ProjectStatus.UNASSIGNED,
        current_workflow_type: data.procurement_type,
        receive_no: receiveNumber,
        created_by: user.id,
      },
    });
  });
};

export const getById = async (user: AuthPayload, id: string): Promise<any> => {
  return await prisma.$transaction(async (tx) => {
    const projectData = await tx.project.findUnique({
      where: { id },
      include: {
        requesting_unit: {
          include: {
            department: { select: { id: true, name: true } },
          },
        },
        assignee_procurement: {
          include: {
            roles: {
              select: {
                role: true,
                department: { select: { id: true, name: true } },
                unit: { select: { id: true, name: true } },
              },
            },
          },
        },
        assignee_contract: {
          include: {
            roles: {
              select: {
                role: true,
                department: { select: { id: true, name: true } },
                unit: { select: { id: true, name: true } },
              },
            },
          },
        },
        creator: {
          include: {
            roles: {
              select: {
                role: true,
                department: { select: { id: true, name: true } },
                unit: { select: { id: true, name: true } },
              },
            },
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
        unit_name: projectData.requesting_unit?.name ?? null,
        unit_id: projectData.requesting_unit?.id ?? null,
        dept_name: projectData.requesting_unit?.department?.name ?? null,
        dept_id: projectData.requesting_unit?.department?.id ?? null,
      },
      creator: {
        full_name: projectData.creator.full_name,
        roles: projectData.creator.roles.map((r) => r.role),
        unit_name: projectData.creator.roles[0]?.unit?.name ?? null,
        unit_id: projectData.creator.roles[0]?.unit?.id ?? null,
        dept_name: projectData.creator.roles[0]?.department?.name ?? null,
        dept_id: projectData.creator.roles[0]?.department?.id ?? null,
      },
      assignee_procurement: projectData.assignee_procurement.map((u) => ({
        id: u.id,
        full_name: u.full_name,
        roles: u.roles.map((r) => r.role),
        unit_name: u.roles[0]?.unit?.name ?? null,
        unit_id: u.roles[0]?.unit?.id ?? null,
      })),
      assignee_contract: projectData.assignee_contract.map((u) => ({
        id: u.id,
        full_name: u.full_name,
        roles: u.roles.map((r) => r.role),
        unit_name: u.roles[0]?.unit?.name ?? null,
        unit_id: u.roles[0]?.unit?.id ?? null,
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

    const { procurement, contract } = await getWorkflowStatus(id, tx);

    return {
      ...project,
      procurement_status: procurement,
      contract_status: contract,
    };
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

  if (user.roles.some((r) => r.role === Role.HEAD_OF_UNIT)) {
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
      current_template: {
        type: {
          in: unit.map((u) => u.type),
        },
      },
    });
  } else if (user.roles.some((r) => r.role === Role.GENERAL_STAFF)) {
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
    const updatedProjects = [];
    for (const item of data) {
      const { id, userId: assigneeId } = item;
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
        throw new BadRequestError(`Project ${id} not found`);
      }
      const assigneeField =
        project.current_workflow_type === UnitResponsibleType.CONTRACT
          ? 'assignee_contract'
          : 'assignee_procurement';
      await UserService.getById(assigneeId);

      if (project.status !== ProjectStatus.UNASSIGNED) {
        throw new BadRequestError(`Project ${id} is not unassigned`);
      }
      if ((project as any)[assigneeField].length > 0) {
        throw new BadRequestError(`Project ${id} is already assigned`);
      }

      const updated = await tx.project.update({
        where: {
          id,
          status: ProjectStatus.UNASSIGNED,
          [assigneeField]: { none: {} },
        },
        data: {
          status: ProjectStatus.WAITING_ACCEPT,
          [assigneeField]: {
            connect: { id: assigneeId },
          },
        },
        select: { id: true, status: true, [assigneeField]: true },
      });

      updatedProjects.push(updated);

      await tx.projectHistory.create({
        data: {
          project_id: id,
          action: LogActionType.ASSIGNEE_UPDATE,
          old_value: { status: project.status, [assigneeField]: [] },
          new_value: { status: updated.status, [assigneeField]: [assigneeId] },
          changed_by: user.id,
        },
      });
    }
    return { data: updatedProjects };
  });
};

export const changeAssignee = async (
  user: AuthPayload,
  data: UpdateStatusProjectDto
) => {
  const { id, userId: newAssigneeId } = data;
  if (!newAssigneeId) {
    throw new BadRequestError('No new assignee ID provided for update');
  }

  const project = await prisma.project.findUnique({
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

  return await prisma.$transaction(async (tx) => {
    const oldAssigneeId = (project as any)[assigneeField]?.[0]?.id;
    await UserService.getById(newAssigneeId);

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
  const project = await prisma.project.findUnique({
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

  return await prisma.$transaction(async (tx) => {
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
    const updatedProjects = [];

    for (const id of data.id) {
      const project = await tx.project.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          assignee_procurement: true,
          assignee_contract: true,
          current_workflow_type: true,
        },
      });

      if (!project) {
        throw new NotFoundError(`Project ${id} not found`);
      }

      const assigneeField =
        project.current_workflow_type === UnitResponsibleType.CONTRACT
          ? 'assignee_contract'
          : 'assignee_procurement';

      if (project[assigneeField]?.some((u) => u.id === user.id) === false) {
        throw new BadRequestError(`You are not the assignee of project ${id}`);
      }

      if (project.status !== ProjectStatus.WAITING_ACCEPT) {
        throw new BadRequestError(
          `Project ${id} is not in WAITING_ACCEPT status`
        );
      }

      const updated = await tx.project.update({
        where: { id, status: ProjectStatus.WAITING_ACCEPT },
        data: {
          status: ProjectStatus.IN_PROGRESS,
        },
        select: { id: true, status: true },
      });

      await tx.projectHistory.create({
        data: {
          project_id: id,
          action: LogActionType.STATUS_UPDATE,
          old_value: { status: ProjectStatus.WAITING_ACCEPT },
          new_value: { status: ProjectStatus.IN_PROGRESS },
          changed_by: user.id,
        },
      });

      updatedProjects.push(updated);
    }

    return { data: updatedProjects };
  });
};

export const addAssignee = async (
  user: AuthPayload,
  projectId: string,
  assigneeId: string
) => {
  return await prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: projectId },
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

    if (project[assigneeField].some((u) => u.id === assigneeId)) {
      throw new BadRequestError('User is already an assignee of this project');
    }
    await UserService.getById(assigneeId);

    const updated = await tx.project.update({
      where: { id: projectId, [assigneeField]: { none: { id: assigneeId } } },
      data: {
        [assigneeField]: {
          connect: { id: assigneeId },
        },
      },
      select: { id: true, status: true, [assigneeField]: true },
    });
    await tx.projectHistory.create({
      data: {
        project_id: projectId,
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
  const project = await prisma.project.findUnique({
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

  return await prisma.$transaction(async (tx) => {
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
      user.roles.some((r) => r.role === Role.HEAD_OF_UNIT) ||
      user.roles.some((r) => r.role === Role.HEAD_OF_DEPARTMENT);

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

export const updateProjectData = async (
  user: AuthPayload,
  data: UpdateProjectDto
) => {
  if (!data || !data.updateData || Object.keys(data.updateData).length === 0) {
    throw new BadRequestError('No data provided for update');
  }
  const current = await getById(user, data.id);
  return await prisma.$transaction(async (tx) => {
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
  await getById(user, id);
  await prisma.project.delete({
    where: { id },
  });
};
