import {
  Prisma,
  ProjectPhaseStatus,
  SubmissionStatus,
  UnitResponsibleType,
} from '@prisma/client';
import { PhaseEntry, ProjectPhaseProgress } from '../types/project.type';
import { WORKFLOW_STEP_ORDERS } from './constant';

type LatestByStep = Map<number, SubmissionStatus>;

interface StepSummary {
  latestByStep: LatestByStep;
  allCompleted: boolean;
  firstRejected: number | null;
  firstWaitingApproval: number | null;
  firstWaitingProposal: number | null;
  firstWaitingSignature: number | null;
}

const getStepSummary = async (
  tx: Prisma.TransactionClient,
  projectId: string,
  workflowType: UnitResponsibleType
): Promise<StepSummary> => {
  const submissions = await tx.projectSubmission.findMany({
    where: { project_id: projectId, workflow_type: workflowType },
    orderBy: [{ step_order: 'asc' }, { submission_round: 'desc' }],
    select: { step_order: true, status: true },
  });

  const latestByStep = new Map<number, SubmissionStatus>();
  let firstRejected: number | null = null;
  let firstWaitingApproval: number | null = null;
  let firstWaitingProposal: number | null = null;
  let firstWaitingSignature: number | null = null;

  for (const s of submissions) {
    if (latestByStep.has(s.step_order)) continue;
    latestByStep.set(s.step_order, s.status as SubmissionStatus);

    if (s.status === SubmissionStatus.REJECTED && firstRejected === null)
      firstRejected = s.step_order;
    if (
      s.status === SubmissionStatus.WAITING_APPROVAL &&
      firstWaitingApproval === null
    )
      firstWaitingApproval = s.step_order;
    if (
      s.status === SubmissionStatus.WAITING_PROPOSAL &&
      firstWaitingProposal === null
    )
      firstWaitingProposal = s.step_order;
    if (
      s.status === SubmissionStatus.WAITING_SIGNATURE &&
      firstWaitingSignature === null
    )
      firstWaitingSignature = s.step_order;
  }

  const stepOrders = WORKFLOW_STEP_ORDERS[workflowType] ?? [];
  const allCompleted =
    stepOrders.length > 0 &&
    stepOrders.every((s) => latestByStep.get(s) === SubmissionStatus.COMPLETED);

  return {
    latestByStep,
    firstRejected,
    firstWaitingApproval,
    firstWaitingProposal,
    firstWaitingSignature,
    allCompleted,
  };
};

const computeGeneralStaffProgress = (
  stepOrders: number[],
  latestByStep: LatestByStep,
  firstRejected: number | null,
  firstWaitingApproval: number | null,
  allCompleted: boolean
): PhaseEntry => {
  if (firstRejected !== null) {
    return { status: ProjectPhaseStatus.REJECTED, step: firstRejected };
  } else if (allCompleted) {
    return { status: ProjectPhaseStatus.COMPLETED, step: null };
  }

  for (const step of stepOrders) {
    const status = latestByStep.get(step);
    if (!status) {
      return { status: ProjectPhaseStatus.IN_PROGRESS, step };
    }
  }

  if (firstWaitingApproval !== null) {
    return {
      status: ProjectPhaseStatus.WAITING_APPROVAL,
      step: firstWaitingApproval,
    };
  }

  return { status: ProjectPhaseStatus.COMPLETED, step: null };
};

const computeHeadOfUnitProgress = (
  firstWaitingApproval: number | null,
  allCompleted: boolean
): PhaseEntry => {
  if (allCompleted) return { status: ProjectPhaseStatus.COMPLETED, step: null };
  if (firstWaitingApproval !== null)
    return {
      status: ProjectPhaseStatus.WAITING_APPROVAL,
      step: firstWaitingApproval,
    };
  return { status: ProjectPhaseStatus.NOT_STARTED, step: null };
};

const computeDocumentStaffProgress = (
  firstWaitingProposal: number | null,
  firstWaitingSignature: number | null,
  allCompleted: boolean
): PhaseEntry => {
  if (allCompleted) return { status: ProjectPhaseStatus.COMPLETED, step: null };
  if (firstWaitingProposal !== null)
    return {
      status: ProjectPhaseStatus.WAITING_PROPOSAL,
      step: firstWaitingProposal,
    };
  if (firstWaitingSignature !== null)
    return {
      status: ProjectPhaseStatus.WAITING_SIGNATURE,
      step: firstWaitingSignature,
    };
  return { status: ProjectPhaseStatus.NOT_STARTED, step: null };
};

const computeProgress = async (
  tx: Prisma.TransactionClient,
  projectId: string,
  workflowType: UnitResponsibleType
): Promise<ProjectPhaseProgress> => {
  const stepOrders = WORKFLOW_STEP_ORDERS[workflowType] ?? [];
  const summary = await getStepSummary(tx, projectId, workflowType);

  const generalStaff = computeGeneralStaffProgress(
    stepOrders,
    summary.latestByStep,
    summary.firstRejected,
    summary.firstWaitingApproval,
    summary.allCompleted
  );
  const headOfUnit = computeHeadOfUnitProgress(
    summary.firstWaitingApproval,
    summary.allCompleted
  );
  const documentStaff = computeDocumentStaffProgress(
    summary.firstWaitingProposal,
    summary.firstWaitingSignature,
    summary.allCompleted
  );

  return {
    GENERAL_STAFF: generalStaff,
    HEAD_OF_UNIT: headOfUnit,
    DOCUMENT_STAFF: documentStaff,
  };
};

const resolveProgressField = (workflowType: UnitResponsibleType) =>
  workflowType === UnitResponsibleType.CONTRACT
    ? 'contract_progress'
    : 'procurement_progress';

export const syncProjectPhases = async (
  tx: Prisma.TransactionClient,
  workflowType: UnitResponsibleType,
  projectId: string
) => {
  const progress = await computeProgress(tx, projectId, workflowType);
  const progressField = resolveProgressField(workflowType);

  return await tx.project.update({
    where: { id: projectId },
    data: {
      [progressField]: progress,
    },
    select: {
      id: true,
      procurement_progress: true,
      contract_progress: true,
    },
  });
};
