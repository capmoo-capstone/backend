import { prisma } from '../config/prisma';
import {
  LogActionType,
  ProjectStatus,
  ProjectPhaseStatus,
  SubmissionStatus,
  SubmissionType,
  UnitResponsibleType,
  UserRole,
} from '../../generated/prisma/client';
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
import * as UnitService from './unit.service';
import { ProjectWhereInput } from '../../generated/prisma/models';
import { UserPayload } from '../lib/types';

const mapSubmissionToPhaseStatus = (
  status: SubmissionStatus
): ProjectPhaseStatus => {
  switch (status) {
    case SubmissionStatus.SUBMITTED:
      return ProjectPhaseStatus.WAITING_APPROVAL;
    case SubmissionStatus.PENDING_PROPOSAL:
      return ProjectPhaseStatus.PENDING_PROPOSAL;
    case SubmissionStatus.PROPOSING:
      return ProjectPhaseStatus.PROPOSING;
    case SubmissionStatus.REJECTED:
      return ProjectPhaseStatus.REJECTED;
    case SubmissionStatus.COMPLETED:
      return ProjectPhaseStatus.COMPLETED;
    default:
      return ProjectPhaseStatus.IN_PROGRESS;
  }
};

const computePhaseStatus = async (
  projectId: string,
  templateType: UnitResponsibleType
): Promise<PhaseStatusResult> => {
  const template = await prisma.workflowTemplate.findFirst({
    where: { type: templateType },
    select: {
      id: true,
      steps: { orderBy: { order: 'asc' }, select: { id: true, order: true } },
    },
  });

  if (!template)
    throw new Error(`Template not found for type: ${templateType}`);

  const submissions = await prisma.projectSubmission.findMany({
    where: {
      project_id: projectId,
      submission_type: SubmissionType.STAFF,
      step: { template_id: template.id },
    },
    orderBy: { submission_round: 'desc' },
    select: { step_id: true, status: true },
  });

  const latestByStep = new Map<string, SubmissionStatus>();
  for (const s of submissions) {
    if (s.step_id && !latestByStep.has(s.step_id)) {
      latestByStep.set(s.step_id, s.status as SubmissionStatus);
    }
  }

  for (const step of template.steps) {
    if (latestByStep.get(step.id) === SubmissionStatus.REJECTED) {
      return { status: ProjectPhaseStatus.REJECTED, step: step.order };
    }
  }

  for (const step of template.steps) {
    if (!latestByStep.has(step.id)) {
      return { status: ProjectPhaseStatus.IN_PROGRESS, step: step.order };
    }
  }

  for (const step of template.steps) {
    const currentStatus = latestByStep.get(step.id);
    if (currentStatus !== SubmissionStatus.COMPLETED) {
      return {
        status: mapSubmissionToPhaseStatus(currentStatus as SubmissionStatus),
        step: step.order,
      };
    }
  }

  return { status: ProjectPhaseStatus.COMPLETED };
};

export const getWorkflowStatus = async (projectId: string) => {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      procurement_type: true,
      current_template: { select: { type: true } },
      assignee_procurement_id: true,
      assignee_contract_id: true,
    },
  });

  if (!project) throw new Error('Project not found');

  let procurement: PhaseStatusResult;
  let contract: PhaseStatusResult;

  if (!project.assignee_procurement_id) {
    procurement = { status: ProjectPhaseStatus.NOT_STARTED };
  } else
    procurement = await computePhaseStatus(projectId, project.procurement_type);

  if (
    procurement.status !== ProjectPhaseStatus.COMPLETED ||
    project.current_template.type !== UnitResponsibleType.CONTRACT ||
    !project.assignee_contract_id
  ) {
    contract = { status: ProjectPhaseStatus.NOT_STARTED };
  } else
    contract = await computePhaseStatus(
      projectId,
      UnitResponsibleType.CONTRACT
    );

  await prisma.project.update({
    where: { id: projectId },
    data: {
      procurement_status: { ...procurement },
      contract_status: { ...contract },
    },
  });

  return { procurement, contract };
};

export const listProjects = async (
  user: UserPayload,
  page: number,
  limit: number
): Promise<PaginatedProjects> => {
  const skip = (page - 1) * limit;
  const where: ProjectWhereInput = {};

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
  user: UserPayload,
  data: CreateProjectDto
): Promise<any> => {
  return await prisma.$transaction(async (tx) => {
    const receiveNumber = ((await tx.project.count()) + 1).toString();
    const template = await tx.workflowTemplate.findFirst({
      where: { type: data.procurement_type },
      select: { id: true },
    });
    if (!template) {
      throw new BadRequestError(
        `No workflow template found for procurement type ${data.procurement_type}`
      );
    }

    return await tx.project.create({
      data: {
        ...data,
        status: ProjectStatus.UNASSIGNED,
        current_template_id: template.id,
        receive_no: receiveNumber,
        created_by: user.id,
      },
    });
  });
};

export const getById = async (user: UserPayload, id: string): Promise<any> => {
  return await prisma.$transaction(async (tx) => {
    const projectData = await prisma.project.findUnique({
      where: { id },
      include: {
        current_template: {
          select: {
            type: true,
          },
        },
        current_step: {
          select: {
            name: true,
            order: true,
          },
        },
        requesting_unit: {
          include: {
            dept: { select: { id: true, name: true } },
          },
        },
        assignee_procurement: {
          include: {
            unit: { select: { id: true, name: true } },
          },
        },
        assignee_contract: {
          include: {
            unit: { select: { id: true, name: true } },
          },
        },
        creator: {
          include: {
            unit: {
              select: {
                id: true,
                name: true,
                dept: { select: { id: true, name: true } },
              },
            },
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
      current_template_type: projectData.current_template.type,
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
        dept_name: projectData.requesting_unit?.dept?.name ?? null,
        dept_id: projectData.requesting_unit?.dept?.id ?? null,
      },
      creator: {
        full_name: projectData.creator.full_name,
        role: projectData.creator.role,
        unit_name: projectData.creator.unit?.name ?? null,
        unit_id: projectData.creator.unit?.id ?? null,
        dept_name: projectData.creator.unit?.dept?.name ?? null,
        dept_id: projectData.creator.unit?.dept?.id ?? null,
      },
      assignee_procurement: {
        id: projectData.assignee_procurement?.id ?? null,
        full_name: projectData.assignee_procurement?.full_name ?? null,
        role: projectData.assignee_procurement?.role ?? null,
        unit_name: projectData.assignee_procurement?.unit?.name ?? null,
        unit_id: projectData.assignee_procurement?.unit?.id ?? null,
      },
      assignee_contract: {
        id: projectData.assignee_contract?.id ?? null,
        full_name: projectData.assignee_contract?.full_name ?? null,
        role: projectData.assignee_contract?.role ?? null,
        unit_name: projectData.assignee_contract?.unit?.name ?? null,
        unit_id: projectData.assignee_contract?.unit?.id ?? null,
      },
      current_step: projectData.current_step,
    };

    const workflow = await tx.workflowTemplate.findUnique({
      where: { id: projectData.current_template_id },
      select: {
        type: true,
        steps: {
          orderBy: { order: 'asc' },
          select: {
            name: true,
            order: true,
            required_step: true,
            required_documents: true,
          },
        },
      },
    });

    if (!workflow) {
      throw new NotFoundError('Workflow template not found for this project');
    }

    const submissionData = await prisma.projectSubmission.findMany({
      where: { project_id: id, submission_type: SubmissionType.STAFF },
      orderBy: [{ submission_round: 'asc' }],
      include: {
        documents: {
          select: { field_key: true, file_name: true, file_path: true },
        },
        step: true,
        submit_user: true,
        action: true,
      },
    });

    const submissions = submissionData.map((submission) => ({
      step_name: submission.step!.name,
      step_order: submission.step!.order,
      submission_round: submission.submission_round,
      status: submission.status,
      type: submission.submission_type,
      submitted_by: submission.submit_user?.full_name ?? null,
      submitted_at: submission.submitted_at,
      comment: submission.comment ?? null,
      action_by: submission.action?.full_name ?? null,
      action_at: submission.action_at,
      documents: submission.documents,
      meta_data: submission.meta_data ?? null,
    }));

    const [procurementPhase, contractPhase] = await Promise.all([
      computePhaseStatus(id, projectData.procurement_type),
      computePhaseStatus(id, UnitResponsibleType.CONTRACT),
    ]);

    return {
      ...project,
      workflow,
      submissions,
      procurement_phase: procurementPhase,
      contract_phase: contractPhase,
    };
  });
};

export const getUnassignedProjectsByUnit = async (
  user: UserPayload
): Promise<ProjectsListResponse> => {
  const unit = await UnitService.getById(user.unit!.id);
  const where: any = {
    status: { in: [ProjectStatus.UNASSIGNED] },
    current_template: {
      type: {
        in: unit.type,
      },
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
          select: { name: true, dept: { select: { name: true } } },
        },
        budget: true,
        procurement_type: true,
        current_template: { select: { type: true } },
        is_urgent: true,
        expected_approval_date: true,
        created_at: true,
      },
    }),
    prisma.project.count({ where }),
  ]);

  return {
    total,
    data: projects.map((project) => {
      return {
        ...project,
        template_type: project.current_template.type,
        current_template: undefined,
      };
    }),
  };
};

export const getAssignedProjects = async (
  user: UserPayload,
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

  if (user.role === UserRole.HEAD_OF_UNIT) {
    // Unit-based query
    const unit = await prisma.unit.findUnique({
      where: { id: user.unit!.id },
      select: { type: true },
    });

    if (!unit) {
      throw new NotFoundError('Unit not found');
    }
    where.AND.push({
      current_template: {
        type: {
          in: unit.type,
        },
      },
    });
  } else if (user.role === UserRole.GENERAL_STAFF) {
    // User-based query
    where.AND.push({
      OR: [
        { assignee_procurement_id: user.id },
        { assignee_contract_id: user.id },
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
          select: { name: true, dept: { select: { name: true } } },
        },
        budget: true,
        procurement_type: true,
        current_template: { select: { type: true } },
        current_step: {
          select: { name: true, order: true },
        },
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
        project.current_template.type === UnitResponsibleType.CONTRACT
          ? 'assignee_contract'
          : 'assignee_procurement';
      const assignee = (project as any)[assigneeField];
      return {
        ...project,
        template_type: project.current_template.type,
        current_step_name: project.current_step?.name || null,
        current_step_order: project.current_step?.order || null,
        assignee_id: assignee?.id || null,
        assignee_full_name: assignee?.full_name || null,
        current_template: undefined,
        current_step: undefined,
        assignee_procurement: undefined,
        assignee_contract: undefined,
      };
    }),
  };
};

export const assignProjectsToUser = async (
  user: UserPayload,
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
          current_template: true,
          assignee_contract_id: true,
          assignee_procurement_id: true,
        },
      });

      if (!project) {
        throw new BadRequestError(`Project ${id} not found`);
      }
      const assigneeField =
        project.current_template?.type === UnitResponsibleType.CONTRACT
          ? 'assignee_contract_id'
          : 'assignee_procurement_id';
      await UserService.getById(assigneeId);

      if (project.status !== ProjectStatus.UNASSIGNED) {
        throw new BadRequestError(`Project ${id} is not unassigned`);
      }
      if ((project as any)[assigneeField] !== null) {
        throw new BadRequestError(`Project ${id} is already assigned`);
      }

      const updated = await tx.project.update({
        where: {
          id,
          status: ProjectStatus.UNASSIGNED,
          [assigneeField]: null,
        },
        data: {
          status: ProjectStatus.WAITING_ACCEPT,
          [assigneeField]: assigneeId,
        },
        select: { id: true, status: true, [assigneeField]: true },
      });

      updatedProjects.push(updated);

      await tx.projectHistory.create({
        data: {
          project_id: id,
          action: LogActionType.ASSIGNEE_UPDATE,
          old_value: { status: project.status, assignee: null },
          new_value: { status: updated.status, assignee: assigneeId },
          changed_by: user.id,
        },
      });
    }
    return { data: updatedProjects };
  });
};

export const changeAssignee = async (
  user: UserPayload,
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
      current_template: {
        select: {
          type: true,
        },
      },
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
    project.current_template?.type === UnitResponsibleType.CONTRACT
      ? 'assignee_contract_id'
      : 'assignee_procurement_id';

  return await prisma.$transaction(async (tx) => {
    const oldAssigneeId = (project as any)[assigneeField];
    await UserService.getById(newAssigneeId);

    const updated = await tx.project.update({
      where: { id },
      data: {
        [assigneeField]: newAssigneeId,
      },
      select: { id: true, status: true, [assigneeField]: true },
    });
    await tx.projectHistory.create({
      data: {
        project_id: id,
        action: LogActionType.ASSIGNEE_UPDATE,
        old_value: { assignee: oldAssigneeId },
        new_value: { assignee: newAssigneeId },
        changed_by: user.id,
      },
    });
    return { data: updated };
  });
};

export const claimProject = async (user: UserPayload, projectId: string) => {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      current_template: true,
    },
  });

  if (!project) {
    throw new NotFoundError('Project not found');
  }
  const assigneeField =
    project.current_template?.type === UnitResponsibleType.CONTRACT
      ? 'assignee_contract_id'
      : 'assignee_procurement_id';

  if (project.status !== ProjectStatus.UNASSIGNED) {
    throw new BadRequestError('This project cannot be claimed');
  }

  return await prisma.$transaction(async (tx) => {
    const updated = await tx.project.update({
      where: {
        id: projectId,
        status: ProjectStatus.UNASSIGNED,
        [assigneeField]: null,
      },
      data: {
        status: ProjectStatus.IN_PROGRESS,
        [assigneeField]: user.id,
      },
      select: { id: true, status: true, [assigneeField]: true },
    });

    await tx.projectHistory.create({
      data: {
        project_id: projectId,
        action: LogActionType.ASSIGNEE_UPDATE,
        old_value: { status: project.status, assignee: null },
        new_value: { status: updated.status, assignee: updated[assigneeField] },
        changed_by: user.id,
      },
    });

    return { data: updated };
  });
};

export const acceptProjects = async (
  user: UserPayload,
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
          assignee_procurement_id: true,
          assignee_contract_id: true,
          current_template: true,
        },
      });

      if (!project) {
        throw new NotFoundError(`Project ${id} not found`);
      }

      const assigneeField =
        project.current_template?.type === UnitResponsibleType.CONTRACT
          ? 'assignee_contract_id'
          : 'assignee_procurement_id';

      if (user.id !== project[assigneeField]) {
        throw new BadRequestError(`You are not the assignee of project ${id}`);
      }

      if (project.status !== ProjectStatus.WAITING_ACCEPT) {
        throw new BadRequestError(
          `Project ${id} is not in WAITING_ACCEPT status`
        );
      }

      const updated = await tx.project.update({
        where: { id },
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

export const cancelProject = async (
  user: UserPayload,
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

    const updated = await tx.project.update({
      where: { id: data.id },
      data: {
        status: ProjectStatus.CANCELLED,
      },
      select: { id: true, status: true },
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
        cancelled_by: user.id,
      },
      select: { reason: true },
    });

    return {
      id: updated.id,
      status: updated.status,
      reason: cancelled.reason,
    };
  });
};

export const updateProjectData = async (
  user: UserPayload,
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
  user: UserPayload,
  id: string
): Promise<void> => {
  await getById(user, id);
  await prisma.project.delete({
    where: { id },
  });
};
