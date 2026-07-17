import { ProjectFinanceExport, UnitResponsibleType } from '@prisma/client';
import { prisma } from '../config/prisma';
import { AuthPayload } from '../types/auth.type';
import { BadRequestError, NotFoundError } from '../lib/errors';
import { ListResponse, PaginatedResponse } from '../types/common.type';
import {
  CompleteInstallmentDto,
  ExportFinanceDataDto,
} from '../schemas/project.schema';

export const createFinanceExportRequest = async (
  user: AuthPayload,
  data: CompleteInstallmentDto
): Promise<ProjectFinanceExport> => {
  return await prisma.$transaction(async (tx) => {
    const installmentData = await tx.project.findUnique({
      where: {
        id: data.id,
      },
      select: { installment_rounds: true, current_workflow_type: true },
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

    // TODO: Check that the submission in this installment is all COMPLETED

    return await tx.projectFinanceExport.upsert({
      where: {
        project_id_installment_no: {
          project_id: data.id,
          installment_no: data.installment_no,
        },
      },
      create: {
        project_id: data.id,
        installment_no: data.installment_no,
        is_exported: false,
        created_by: user.id,
      },
      update: {},
    });
  });
};

export const getFinanceExportRequest = async (
  _user: AuthPayload,
  page: number,
  limit: number
): Promise<PaginatedResponse<ProjectFinanceExport>> => {
  const [exportData, count] = await Promise.all([
    prisma.projectFinanceExport.findMany({
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.projectFinanceExport.count(),
  ]);

  return {
    total: count,
    page,
    pageSize: limit,
    totalPages: Math.ceil(count / limit),
    data: exportData,
  };
};

export const exportFinanceData = async (
  user: AuthPayload,
  data: ExportFinanceDataDto
): Promise<ListResponse<ProjectFinanceExport>> => {
  return await prisma.$transaction(async (tx) => {
    const countExportRequests = await tx.projectFinanceExport.count({
      where: {
        id: {
          in: data.id,
        },
        is_exported: false,
      },
    });
    if (countExportRequests !== data.id.length) {
      throw new BadRequestError(
        'Some export requests are already exported or not found'
      );
    }
    const updated = await tx.projectFinanceExport.updateManyAndReturn({
      where: {
        id: {
          in: data.id,
        },
        is_exported: false,
      },
      data: {
        is_exported: true,
        exported_by: user.id,
        exported_at: new Date(),
      },
      select: {
        project_id: true,
        installment_no: true,
        is_exported: true,
      },
    });

    return {
      total: updated.length,
      data: updated,
    };
  });
};
