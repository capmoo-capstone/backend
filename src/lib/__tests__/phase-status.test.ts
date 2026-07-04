import {
  ProjectPhaseStatus,
  SubmissionStatus,
  UnitResponsibleType,
} from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { syncProjectPhases } from '../phase-status';

const createPhaseTx = (
  submissions: {
    installment_no?: number | null;
    step_order: number;
    status: SubmissionStatus;
  }[],
  installmentRounds = 1
) => {
  const tx = {
    projectSubmission: {
      findMany: vi.fn().mockResolvedValue(submissions),
    },
    project: {
      findUnique: vi.fn().mockResolvedValue({
        installment_rounds: installmentRounds,
      }),
      update: vi.fn().mockResolvedValue({
        id: 'project-1',
        procurement_progress: {},
        contract_progress: {},
      }),
    },
  } as any;

  return tx;
};

describe('syncProjectPhases', () => {
  it('marks the first missing procurement step as in progress for general staff', async () => {
    const tx = createPhaseTx([]);

    await syncProjectPhases(tx, UnitResponsibleType.LT100K, 'project-1');

    expect(tx.projectSubmission.findMany).toHaveBeenCalledWith({
      where: {
        project_id: 'project-1',
        workflow_type: UnitResponsibleType.LT100K,
      },
      orderBy: [{ step_order: 'asc' }, { submission_round: 'desc' }],
      select: { step_order: true, status: true },
    });
    expect(tx.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          procurement_progress: {
            GENERAL_STAFF: { status: ProjectPhaseStatus.IN_PROGRESS, step: 1 },
            HEAD_OF_UNIT: {
              status: ProjectPhaseStatus.NOT_STARTED,
              step: null,
            },
            DOCUMENT_STAFF: {
              status: ProjectPhaseStatus.NOT_STARTED,
              step: null,
            },
          },
        },
      })
    );
  });

  it('marks all phase owners completed when every workflow step is completed', async () => {
    const tx = createPhaseTx([
      { step_order: 1, status: SubmissionStatus.COMPLETED },
      { step_order: 2, status: SubmissionStatus.COMPLETED },
      { step_order: 3, status: SubmissionStatus.COMPLETED },
      { step_order: 4, status: SubmissionStatus.COMPLETED },
    ]);

    await syncProjectPhases(tx, UnitResponsibleType.LT100K, 'project-1');

    expect(tx.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          procurement_progress: {
            GENERAL_STAFF: { status: ProjectPhaseStatus.COMPLETED, step: null },
            HEAD_OF_UNIT: { status: ProjectPhaseStatus.COMPLETED, step: null },
            DOCUMENT_STAFF: {
              status: ProjectPhaseStatus.COMPLETED,
              step: null,
            },
          },
        },
      })
    );
  });

  it('writes contract progress and surfaces waiting signature to document staff', async () => {
    const tx = createPhaseTx(
      [
        {
          installment_no: 1,
          step_order: 1,
          status: SubmissionStatus.COMPLETED,
        },
        {
          installment_no: 1,
          step_order: 2,
          status: SubmissionStatus.WAITING_SIGNATURE,
        },
      ],
      1
    );

    await syncProjectPhases(tx, UnitResponsibleType.CONTRACT, 'project-1');

    expect(tx.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          contract_progress: {
            GENERAL_STAFF: {
              status: ProjectPhaseStatus.IN_PROGRESS,
              step: 3,
              installment_no: 1,
            },
            HEAD_OF_UNIT: {
              status: ProjectPhaseStatus.NOT_STARTED,
              step: null,
              installment_no: null,
            },
            DOCUMENT_STAFF: {
              status: ProjectPhaseStatus.WAITING_SIGNATURE,
              step: 2,
              installment_no: 1,
            },
          },
        },
      })
    );
  });

  it('points contract progress to the first incomplete installment', async () => {
    const tx = createPhaseTx(
      [
        {
          installment_no: 1,
          step_order: 1,
          status: SubmissionStatus.COMPLETED,
        },
        {
          installment_no: 1,
          step_order: 2,
          status: SubmissionStatus.COMPLETED,
        },
        {
          installment_no: 1,
          step_order: 3,
          status: SubmissionStatus.COMPLETED,
        },
        {
          installment_no: 1,
          step_order: 4,
          status: SubmissionStatus.COMPLETED,
        },
        {
          installment_no: 1,
          step_order: 5,
          status: SubmissionStatus.COMPLETED,
        },
      ],
      2
    );

    await syncProjectPhases(tx, UnitResponsibleType.CONTRACT, 'project-1');

    expect(tx.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          contract_progress: {
            GENERAL_STAFF: {
              status: ProjectPhaseStatus.IN_PROGRESS,
              step: 1,
              installment_no: 2,
            },
            HEAD_OF_UNIT: {
              status: ProjectPhaseStatus.NOT_STARTED,
              step: null,
              installment_no: null,
            },
            DOCUMENT_STAFF: {
              status: ProjectPhaseStatus.NOT_STARTED,
              step: null,
              installment_no: null,
            },
          },
        },
      })
    );
  });

  it('surfaces rejected and waiting states from the active contract installment', async () => {
    const tx = createPhaseTx(
      [
        {
          installment_no: 1,
          step_order: 1,
          status: SubmissionStatus.COMPLETED,
        },
        {
          installment_no: 1,
          step_order: 2,
          status: SubmissionStatus.COMPLETED,
        },
        {
          installment_no: 1,
          step_order: 3,
          status: SubmissionStatus.COMPLETED,
        },
        {
          installment_no: 1,
          step_order: 4,
          status: SubmissionStatus.COMPLETED,
        },
        {
          installment_no: 1,
          step_order: 5,
          status: SubmissionStatus.COMPLETED,
        },
        {
          installment_no: 2,
          step_order: 1,
          status: SubmissionStatus.COMPLETED,
        },
        { installment_no: 2, step_order: 2, status: SubmissionStatus.REJECTED },
        {
          installment_no: 2,
          step_order: 3,
          status: SubmissionStatus.WAITING_APPROVAL,
        },
        {
          installment_no: 2,
          step_order: 4,
          status: SubmissionStatus.WAITING_SIGNATURE,
        },
      ],
      2
    );

    await syncProjectPhases(tx, UnitResponsibleType.CONTRACT, 'project-1');

    expect(tx.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          contract_progress: {
            GENERAL_STAFF: {
              status: ProjectPhaseStatus.REJECTED,
              step: 2,
              installment_no: 2,
            },
            HEAD_OF_UNIT: {
              status: ProjectPhaseStatus.WAITING_APPROVAL,
              step: 3,
              installment_no: 2,
            },
            DOCUMENT_STAFF: {
              status: ProjectPhaseStatus.WAITING_SIGNATURE,
              step: 4,
              installment_no: 2,
            },
          },
        },
      })
    );
  });

  it('marks contract progress completed after every installment step is completed', async () => {
    const tx = createPhaseTx(
      [1, 2].flatMap((installmentNo) =>
        [1, 2, 3, 4, 5].map((stepOrder) => ({
          installment_no: installmentNo,
          step_order: stepOrder,
          status: SubmissionStatus.COMPLETED,
        }))
      ),
      2
    );

    await syncProjectPhases(tx, UnitResponsibleType.CONTRACT, 'project-1');

    expect(tx.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          contract_progress: {
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
          },
        },
      })
    );
  });

  it('uses only the latest submission per step when deriving progress', async () => {
    const tx = createPhaseTx([
      { step_order: 1, status: SubmissionStatus.REJECTED },
      { step_order: 1, status: SubmissionStatus.COMPLETED },
    ]);

    await syncProjectPhases(tx, UnitResponsibleType.LT100K, 'project-1');

    expect(tx.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          procurement_progress: expect.objectContaining({
            GENERAL_STAFF: { status: ProjectPhaseStatus.REJECTED, step: 1 },
          }),
        }),
      })
    );
  });
});
