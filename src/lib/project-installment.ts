import { Prisma, UnitResponsibleType } from '@prisma/client';
import { BadRequestError, NotFoundError } from './errors';

const installmentLockKey = (projectId: string) =>
  `project-installments:${projectId}`;

export const acquireProjectInstallmentLock = async (
  tx: Prisma.TransactionClient,
  projectId: string
) => {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${installmentLockKey(projectId)}))`;
};

export const assertInstallmentRoundsCanBeUpdated = async (
  tx: Prisma.TransactionClient,
  projectId: string
) => {
  await acquireProjectInstallmentLock(tx, projectId);

  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: {
      current_workflow_type: true,
    },
  });

  if (!project) {
    throw new NotFoundError('Project not found');
  }

  if (project.current_workflow_type !== UnitResponsibleType.CONTRACT) {
    throw new BadRequestError(
      'Installment rounds can only be updated during CONTRACT workflow'
    );
  }

  const exportCount = await tx.projectFinanceExport.count({
    where: { project_id: projectId },
  });

  if (exportCount > 0) {
    throw new BadRequestError(
      'Installment rounds cannot be updated after an installment export is created'
    );
  }
};

