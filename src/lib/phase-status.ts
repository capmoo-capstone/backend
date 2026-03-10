import {
  ProjectPhaseStatus,
  SubmissionStatus,
  UnitResponsibleType,
  Prisma,
  SubmissionType,
} from '@prisma/client';
import { WORKFLOW_STEP_ORDERS } from './constant';

export interface PhaseStatusResult {
  status: ProjectPhaseStatus;
  step?: number;
}

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

const computePhaseStatus = async (
  tx: Prisma.TransactionClient,
  projectId: string,
  workflowType: UnitResponsibleType
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
      if (s.status === SubmissionStatus.REJECTED) {
        return { status: ProjectPhaseStatus.REJECTED, step: s.step_order };
      }
      latestByStep.set(s.step_order, s.status as SubmissionStatus);
    }
  }

  let firstWaiting: { step: number; status: SubmissionStatus } | null = null;

  for (const stepOrder of stepOrders) {
    const currentStatus = latestByStep.get(stepOrder);

    if (!currentStatus) {
      return { status: ProjectPhaseStatus.IN_PROGRESS, step: stepOrder };
    }

    if (currentStatus !== SubmissionStatus.COMPLETED && !firstWaiting) {
      firstWaiting = { step: stepOrder, status: currentStatus };
    }
  }

  if (firstWaiting) {
    return {
      status: mapSubmissionToPhaseStatus(firstWaiting.status),
      step: firstWaiting.step,
    };
  }

  return { status: ProjectPhaseStatus.COMPLETED };
};

export const syncProjectPhases = async (
  tx: Prisma.TransactionClient,
  workflowType: UnitResponsibleType,
  projectId: string
) => {
  const { status, step } = await computePhaseStatus(
    tx,
    projectId,
    workflowType
  );

  const dataToUpdate: Partial<{
    procurement_status: ProjectPhaseStatus;
    procurement_step: number;
    contract_status: ProjectPhaseStatus;
    contract_step: number;
  }> = {};
  if (workflowType === UnitResponsibleType.CONTRACT) {
    dataToUpdate.contract_status = status;
    dataToUpdate.contract_step = step;
  } else {
    dataToUpdate.procurement_status = status;
    dataToUpdate.procurement_step = step;
  }

  return await tx.project.update({
    where: { id: projectId },
    data: dataToUpdate,
    select: {
      id: true,
      procurement_status: true,
      procurement_step: true,
      contract_status: true,
      contract_step: true,
    },
  });
};
