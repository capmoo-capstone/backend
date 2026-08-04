import {
  Prisma,
  ProjectActionType,
  ProjectInstallment,
  ProjectInstallmentStatus,
  ProjectStatus,
  SubmissionStatus,
  UnitResponsibleType,
} from '@prisma/client';
import { prisma } from '../config/prisma';
import { AuthPayload } from '../types/auth.type';
import { BadRequestError, NotFoundError } from '../lib/errors';
import { ListResponse, PaginatedResponse } from '../types/common.type';
import { WORKFLOW_STEP_ORDERS } from '../lib/constant';
import { acquireProjectInstallmentLock } from '../lib/project-installment';
import { createProjectHistoryAndAuditEvent } from './audit-log.service';
import {
  CompleteInstallmentDto,
  ExportInstallmentDto,
  GetInstallmentsQuery,
} from '../schemas/project.schema';

const assertContractInstallmentCompleted = async (
  tx: Prisma.TransactionClient,
  projectId: string,
  installmentNo: number
) => {
  const submissions = await tx.projectSubmission.findMany({
    where: {
      project_id: projectId,
      workflow_type: UnitResponsibleType.CONTRACT,
      installment_no: installmentNo,
    },
    orderBy: [{ step_order: 'asc' }, { submission_round: 'desc' }],
    select: { step_order: true, status: true },
  });

  const latestStatusByStep = new Map<number, SubmissionStatus>();
  for (const submission of submissions) {
    if (!latestStatusByStep.has(submission.step_order)) {
      latestStatusByStep.set(submission.step_order, submission.status);
    }
  }

  const isCompleted = WORKFLOW_STEP_ORDERS[UnitResponsibleType.CONTRACT].every(
    (stepOrder) =>
      latestStatusByStep.get(stepOrder) === SubmissionStatus.COMPLETED
  );

  if (!isCompleted) {
    throw new BadRequestError(
      'All contract steps for this installment must be completed before requesting finance export'
    );
  }
};

export const createInstallment = async (
  user: AuthPayload,
  data: CompleteInstallmentDto
): Promise<ProjectInstallment> => {
  return await prisma.$transaction(async (tx) => {
    await acquireProjectInstallmentLock(tx, data.id);

    const installmentData = await tx.project.findUnique({
      where: {
        id: data.id,
      },
      select: {
        installment_rounds: true,
        current_workflow_type: true,
        contract_completed_at: true,
      },
    });

    if (!installmentData) {
      throw new NotFoundError('Project not found');
    }

    if (
      installmentData.current_workflow_type !== UnitResponsibleType.CONTRACT
    ) {
      throw new BadRequestError(
        'Installment Finance Export Request is only allowed for CONTRACT workflow'
      );
    }

    if (
      data.installment_no < 1 ||
      data.installment_no > installmentData.installment_rounds
    ) {
      throw new BadRequestError(
        `Installment number must be between 1 and ${installmentData.installment_rounds}`
      );
    }

    await assertContractInstallmentCompleted(tx, data.id, data.installment_no);

    const exportRequest = await tx.projectInstallment.upsert({
      where: {
        project_id_installment_no: {
          project_id: data.id,
          installment_no: data.installment_no,
        },
      },
      create: {
        project_id: data.id,
        installment_no: data.installment_no,
        status: ProjectInstallmentStatus.WAITING_EXPORT,
        created_by: user.id,
      },
      update: {
        status: ProjectInstallmentStatus.WAITING_EXPORT,
      },
    });

    const exportCount = await tx.projectInstallment.count({
      where: { project_id: data.id },
    });

    if (
      exportCount === installmentData.installment_rounds &&
      !installmentData.contract_completed_at
    ) {
      await tx.project.update({
        where: { id: data.id },
        data: { contract_completed_at: exportRequest.created_at },
      });
    }

    return exportRequest;
  });
};

export const getInstallments = async (
  _user: AuthPayload,
  page: number,
  limit: number,
  filters?: GetInstallmentsQuery
): Promise<PaginatedResponse<ProjectInstallment>> => {
  const where: Prisma.ProjectInstallmentWhereInput = {};

  if (filters) {
    const conditions: Prisma.ProjectInstallmentWhereInput[] = [];

    if (filters.title?.trim()) {
      conditions.push({
        project: {
          title: {
            contains: filters.title.trim(),
            mode: 'insensitive',
          },
        },
      });
    }

    if (filters.receiveNo?.trim()) {
      conditions.push({
        project: {
          receive_no: {
            contains: filters.receiveNo.trim(),
            mode: 'insensitive',
          },
        },
      });
    }

    if (filters.status && filters.status.length > 0) {
      conditions.push({
        status: { in: filters.status },
      });
    }

    if (filters.procurementType && filters.procurementType.length > 0) {
      conditions.push({
        project: {
          procurement_type: { in: filters.procurementType },
        },
      });
    }

    if (filters.departments && filters.departments.length > 0) {
      conditions.push({
        project: {
          requesting_dept_id: { in: filters.departments },
        },
      });
    }

    if (filters.installment && filters.installment > 0) {
      conditions.push({
        installment_no: filters.installment,
      });
    }

    if (conditions.length > 0) {
      where.AND = conditions;
    }
  }

  const [exportData, count] = await Promise.all([
    prisma.projectInstallment.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        project: {
          select: {
            id: true,
            receive_no: true,
            title: true,
            budget: true,
            procurement_type: true,
            assignee_contract: {
              select: { id: true, full_name: true },
            },
            requesting_dept: {
              select: { id: true, name: true },
            },
          },
        },
        installment_no: true,
        status: true,
        request_edit_reason: true,
      },
    }),
    prisma.projectInstallment.count({ where }),
  ]);

  return {
    total: count,
    page,
    pageSize: limit,
    totalPages: Math.ceil(count / limit),
    data: exportData,
  };
};

export const exportInstallments = async (
  user: AuthPayload,
  data: ExportInstallmentDto
): Promise<ListResponse<ProjectInstallment>> => {
  return await prisma.$transaction(async (tx) => {
    const countExportRequests = await tx.projectInstallment.count({
      where: {
        id: {
          in: data.id,
        },
        status: {
          in: [
            ProjectInstallmentStatus.WAITING_EXPORT,
            ProjectInstallmentStatus.REQUEST_EDIT,
          ],
        },
      },
    });
    if (countExportRequests !== data.id.length) {
      throw new BadRequestError(
        'Some export requests are already exported or not found'
      );
    }
    const updated = await tx.projectInstallment.updateManyAndReturn({
      where: {
        id: {
          in: data.id,
        },
        status: {
          in: [
            ProjectInstallmentStatus.WAITING_EXPORT,
            ProjectInstallmentStatus.REQUEST_EDIT,
          ],
        },
      },
      data: {
        status: ProjectInstallmentStatus.EXPORTED,
        exported_by: user.id,
        exported_at: new Date(),
      },
    });

    const projectIds = [...new Set(updated.map((item) => item.project_id))];

    for (const projectId of projectIds) {
      const project = await tx.project.findUnique({
        where: { id: projectId },
        select: { id: true, status: true, installment_rounds: true },
      });

      if (project && project.status === ProjectStatus.IN_PROGRESS) {
        const exportedCount = await tx.projectInstallment.count({
          where: {
            project_id: projectId,
            status: ProjectInstallmentStatus.EXPORTED,
          },
        });

        if (exportedCount === project.installment_rounds) {
          const updatedProject = await tx.project.update({
            where: { id: projectId },
            data: { status: ProjectStatus.WAITING_CLOSE },
            select: { id: true, status: true },
          });

          await createProjectHistoryAndAuditEvent(tx, {
            projectId,
            action: ProjectActionType.STATUS_UPDATE,
            oldValue: { status: project.status },
            newValue: { status: updatedProject.status },
            changedBy: user,
          });
        }
      }
    }

    return {
      total: updated.length,
      data: updated,
    };
  });
};

export const requestEditInstallment = async (
  user: AuthPayload,
  exportId: string,
  reason: string
): Promise<ProjectInstallment> => {
  return await prisma.$transaction(async (tx) => {
    const exportRecord = await tx.projectInstallment.findUnique({
      where: { id: exportId },
    });

    if (!exportRecord) {
      throw new NotFoundError('Installment export request not found');
    }

    if (exportRecord.status !== ProjectInstallmentStatus.EXPORTED) {
      throw new BadRequestError(
        'Installment export request must be in EXPORTED status to request edit'
      );
    }

    const updatedInstallment = await tx.projectInstallment.update({
      where: { id: exportId },
      data: {
        status: ProjectInstallmentStatus.REQUEST_EDIT,
        request_edit_reason: reason,
      },
    });

    const project = await tx.project.findUnique({
      where: { id: exportRecord.project_id },
      select: { id: true, status: true },
    });

    if (
      project &&
      (project.status === ProjectStatus.WAITING_CLOSE ||
        project.status === ProjectStatus.CLOSED)
    ) {
      const updatedProject = await tx.project.update({
        where: { id: project.id },
        data: { status: ProjectStatus.IN_PROGRESS },
        select: { id: true, status: true },
      });

      await createProjectHistoryAndAuditEvent(tx, {
        projectId: project.id,
        action: ProjectActionType.STATUS_UPDATE,
        oldValue: { status: project.status },
        newValue: { status: updatedProject.status },
        changedBy: user,
      });
    }

    return updatedInstallment;
  });
};
