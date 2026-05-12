import {
  ProjectPhaseStatus,
  SubmissionStatus,
  UnitResponsibleType,
  Prisma,
} from '@prisma/client';
import { WORKFLOW_STEP_ORDERS } from './constant';
import { PhaseEntry, ProjectPhaseProgress } from '../types/project.type';

type LatestByStep = Map<number, SubmissionStatus>;

interface StepSummary {
  latestByStep: LatestByStep;
  hasRejected: boolean;
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
  let hasRejected = false;
  let firstWaitingApproval: number | null = null;
  let firstWaitingProposal: number | null = null;
  let firstWaitingSignature: number | null = null;

  for (const s of submissions) {
    if (latestByStep.has(s.step_order)) continue;
    latestByStep.set(s.step_order, s.status as SubmissionStatus);

    if (s.status === SubmissionStatus.REJECTED) hasRejected = true;
    if (s.status === SubmissionStatus.WAITING_APPROVAL && firstWaitingApproval === null)
      firstWaitingApproval = s.step_order;
    if (s.status === SubmissionStatus.WAITING_PROPOSAL && firstWaitingProposal === null)
      firstWaitingProposal = s.step_order;
    if (s.status === SubmissionStatus.WAITING_SIGNATURE && firstWaitingSignature === null)
      firstWaitingSignature = s.step_order;
  }

  return { latestByStep, hasRejected, firstWaitingApproval, firstWaitingProposal, firstWaitingSignature };
};

const computeGeneralStaffPhase = (
  stepOrders: number[],
  latestByStep: LatestByStep,
  hasRejected: boolean
): PhaseEntry => {
  if (hasRejected) return { status: ProjectPhaseStatus.REJECTED, step: null };

  for (const step of stepOrders) {
    const status = latestByStep.get(step);
    if (!status) return { status: ProjectPhaseStatus.IN_PROGRESS, step };
    if (status === SubmissionStatus.WAITING_APPROVAL)
      return { status: ProjectPhaseStatus.WAITING_APPROVAL, step };
    if (status !== SubmissionStatus.COMPLETED)
      return { status: ProjectPhaseStatus.IN_PROGRESS, step };
  }

  return { status: ProjectPhaseStatus.COMPLETED, step: null };
};

const computeHeadOfUnitPhase = (
  firstWaitingApproval: number | null,
  allCompleted: boolean
): PhaseEntry => {
  if (allCompleted) return { status: ProjectPhaseStatus.COMPLETED, step: null };
  if (firstWaitingApproval !== null)
    return { status: ProjectPhaseStatus.WAITING_APPROVAL, step: firstWaitingApproval };
  return { status: ProjectPhaseStatus.NOT_STARTED, step: null };
};

const computeDocumentStaffPhase = (
  firstWaitingProposal: number | null,
  firstWaitingSignature: number | null,
  allCompleted: boolean
): PhaseEntry => {
  if (allCompleted) return { status: ProjectPhaseStatus.COMPLETED, step: null };
  if (firstWaitingProposal !== null)
    return { status: ProjectPhaseStatus.WAITING_PROPOSAL, step: firstWaitingProposal };
  if (firstWaitingSignature !== null)
    return { status: ProjectPhaseStatus.WAITING_SIGNATURE, step: firstWaitingSignature };
  return { status: ProjectPhaseStatus.NOT_STARTED, step: null };
};

const computeOtherPhase = (
  generalStaff: PhaseEntry
): { status: ProjectPhaseStatus; step: null } => {
  switch (generalStaff.status) {
    case ProjectPhaseStatus.COMPLETED:
      return { status: ProjectPhaseStatus.COMPLETED, step: null };
    case ProjectPhaseStatus.NOT_STARTED:
      return { status: ProjectPhaseStatus.NOT_STARTED, step: null };
    default:
      return { status: ProjectPhaseStatus.IN_PROGRESS, step: null };
  }
};

const computePhase = async (
  tx: Prisma.TransactionClient,
  projectId: string,
  workflowType: UnitResponsibleType
): Promise<ProjectPhaseProgress> => {
  const stepOrders = WORKFLOW_STEP_ORDERS[workflowType] ?? [];
  const summary = await getStepSummary(tx, projectId, workflowType);

  const allCompleted =
    stepOrders.length > 0 &&
    stepOrders.every((s) => summary.latestByStep.get(s) === SubmissionStatus.COMPLETED);

  const generalStaff = computeGeneralStaffPhase(stepOrders, summary.latestByStep, summary.hasRejected);

  return {
    GENERAL_STAFF: generalStaff,
    HEAD_OF_UNIT: computeHeadOfUnitPhase(summary.firstWaitingApproval, allCompleted),
    DOCUMENT_STAFF: computeDocumentStaffPhase(summary.firstWaitingProposal, summary.firstWaitingSignature, allCompleted),
    other: computeOtherPhase(generalStaff),
  };
};

export const syncProjectPhases = async (
  tx: Prisma.TransactionClient,
  workflowType: UnitResponsibleType,
  projectId: string
) => {
  const progress = await computePhase(tx, projectId, workflowType);
  let progressField = 'procurement_progress';
  let phaseField = 'procurement_phase';
  let phaseStatus = progress.GENERAL_STAFF.status;

  if (workflowType === UnitResponsibleType.CONTRACT) {
    progressField = 'contract_progress';
    phaseField = 'contract_phase';
    if (progress.GENERAL_STAFF.status === ProjectPhaseStatus.COMPLETED) {
      phaseStatus = ProjectPhaseStatus.NOT_EXPORTED;
    }
  }
  
  return await tx.project.update({
    where: { id: projectId },
    data: { 
      [progressField]: progress,
      [phaseField]: phaseStatus,
    },
    select: {
      id: true,
      procurement_progress: true,
      contract_progress: true,
      procurement_phase: true,
      contract_phase: true,
    },
  });
};