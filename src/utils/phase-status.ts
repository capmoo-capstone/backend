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

interface ContractStepSummary extends StepSummary {
  installmentNo: number;
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

const summarizeStatuses = (
  stepOrders: number[],
  latestByStep: LatestByStep
): Omit<StepSummary, 'latestByStep'> => {
  let firstRejected: number | null = null;
  let firstWaitingApproval: number | null = null;
  let firstWaitingProposal: number | null = null;
  let firstWaitingSignature: number | null = null;

  for (const stepOrder of stepOrders) {
    const status = latestByStep.get(stepOrder);
    if (status === SubmissionStatus.REJECTED && firstRejected === null)
      firstRejected = stepOrder;
    if (
      status === SubmissionStatus.WAITING_APPROVAL &&
      firstWaitingApproval === null
    )
      firstWaitingApproval = stepOrder;
    if (
      status === SubmissionStatus.WAITING_PROPOSAL &&
      firstWaitingProposal === null
    )
      firstWaitingProposal = stepOrder;
    if (
      status === SubmissionStatus.WAITING_SIGNATURE &&
      firstWaitingSignature === null
    )
      firstWaitingSignature = stepOrder;
  }

  const allCompleted =
    stepOrders.length > 0 &&
    stepOrders.every((s) => latestByStep.get(s) === SubmissionStatus.COMPLETED);

  return {
    firstRejected,
    firstWaitingApproval,
    firstWaitingProposal,
    firstWaitingSignature,
    allCompleted,
  };
};

const getContractStepSummaries = async (
  tx: Prisma.TransactionClient,
  projectId: string
): Promise<ContractStepSummary[]> => {
  const project = await tx.project.findUnique({
    where: { id: projectId },
    select: { installment_rounds: true },
  });
  const installmentRounds = project?.installment_rounds ?? 1;
  const stepOrders = WORKFLOW_STEP_ORDERS[UnitResponsibleType.CONTRACT] ?? [];

  const submissions = await tx.projectSubmission.findMany({
    where: {
      project_id: projectId,
      workflow_type: UnitResponsibleType.CONTRACT,
    },
    orderBy: [
      { installment_no: 'asc' },
      { step_order: 'asc' },
      { submission_round: 'desc' },
    ],
    select: { installment_no: true, step_order: true, status: true },
  });

  const latestByInstallment = new Map<number, LatestByStep>();
  for (
    let installmentNo = 1;
    installmentNo <= installmentRounds;
    installmentNo++
  ) {
    latestByInstallment.set(installmentNo, new Map());
  }

  for (const submission of submissions) {
    const installmentNo = submission.installment_no ?? 1;
    const latestByStep = latestByInstallment.get(installmentNo);
    if (!latestByStep || latestByStep.has(submission.step_order)) continue;
    latestByStep.set(submission.step_order, submission.status);
  }

  return Array.from(latestByInstallment.entries()).map(
    ([installmentNo, latestByStep]) => ({
      installmentNo,
      latestByStep,
      ...summarizeStatuses(stepOrders, latestByStep),
    })
  );
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

const withInstallment = (
  entry: PhaseEntry,
  installmentNo: number | null
): PhaseEntry => ({
  ...entry,
  installment_no: entry.step === null ? null : installmentNo,
});

const computeContractProgress = async (
  tx: Prisma.TransactionClient,
  projectId: string
): Promise<ProjectPhaseProgress> => {
  const stepOrders = WORKFLOW_STEP_ORDERS[UnitResponsibleType.CONTRACT] ?? [];
  const summaries = await getContractStepSummaries(tx, projectId);
  const allInstallmentsCompleted =
    summaries.length > 0 && summaries.every((summary) => summary.allCompleted);

  if (allInstallmentsCompleted) {
    return {
      GENERAL_STAFF: {
        status: ProjectPhaseStatus.COMPLETED,
        step: null,
        installment_no: null,
      },
      HEAD_OF_UNIT: {
        status: ProjectPhaseStatus.COMPLETED,
        step: null,
        installment_no: null,
      },
      DOCUMENT_STAFF: {
        status: ProjectPhaseStatus.COMPLETED,
        step: null,
        installment_no: null,
      },
    };
  }

  const activeSummary =
    summaries.find((summary) => !summary.allCompleted) ?? summaries[0];

  const generalStaff = computeGeneralStaffProgress(
    stepOrders,
    activeSummary.latestByStep,
    activeSummary.firstRejected,
    activeSummary.firstWaitingApproval,
    false
  );
  const headOfUnit = computeHeadOfUnitProgress(
    activeSummary.firstWaitingApproval,
    false
  );
  const documentStaff = computeDocumentStaffProgress(
    activeSummary.firstWaitingProposal,
    activeSummary.firstWaitingSignature,
    false
  );

  return {
    GENERAL_STAFF: withInstallment(generalStaff, activeSummary.installmentNo),
    HEAD_OF_UNIT: withInstallment(headOfUnit, activeSummary.installmentNo),
    DOCUMENT_STAFF: withInstallment(documentStaff, activeSummary.installmentNo),
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
  const progress =
    workflowType === UnitResponsibleType.CONTRACT
      ? await computeContractProgress(tx, projectId)
      : await computeProgress(tx, projectId, workflowType);
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
