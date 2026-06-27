import {
  ProcurementType,
  SubmissionStatus,
  SubmissionType,
  UnitResponsibleType,
} from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestError, NotFoundError } from '../../lib/errors';
import { syncProjectPhases } from '../../lib/phase-status';
import { txMock, prismaMock } from '../../test/prisma-mock';
import { generatePresignedDownloadUrl } from '../storage.service';
import {
  approveSubmission,
  createStaffSubmissionsProject,
  createVendorSubmissionsProject,
  getProjectSubmissions,
  getVendorSubmissions,
  proposeSubmission,
  rejectSubmission,
  signAndCompleteSubmission,
} from '../submission.service';

vi.mock('../../lib/phase-status', () => ({
  syncProjectPhases: vi.fn().mockResolvedValue({ id: 'project-1' }),
}));

vi.mock('../storage.service', () => ({
  generatePresignedDownloadUrl: vi.fn(
    async (key: string) => `https://files.test/${key}`
  ),
}));

const mockedSyncProjectPhases = vi.mocked(syncProjectPhases);
const mockedDownloadUrl = vi.mocked(generatePresignedDownloadUrl);

const user = { id: 'user-1', full_name: 'Staff User', roles: [] } as any;

const staffSubmissionDto = (overrides = {}) =>
  ({
    project_id: 'project-1',
    type: SubmissionType.STAFF,
    step_order: 1,
    workflow_type: UnitResponsibleType.LT100K,
    required_approval: true,
    required_updating: false,
    meta_data: [],
    files: [
      { field_key: 'proposal', file_name: 'proposal.pdf', file_path: 'p.pdf' },
    ],
    ...overrides,
  }) as any;

describe('submission.service', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'));
  });

  it('getProjectSubmissions groups procurement and contract submissions and signs document URLs', async () => {
    prismaMock.project.findUniqueOrThrow.mockResolvedValue({
      procurement_type: ProcurementType.LT100K,
    });
    prismaMock.projectSubmission.findMany.mockResolvedValue([
      {
        id: 'submission-1',
        project_id: 'project-1',
        workflow_type: UnitResponsibleType.LT100K,
        step_order: 1,
        status: SubmissionStatus.COMPLETED,
        documents: [
          { field_key: 'proposal', file_name: 'a.pdf', file_path: 'a.pdf' },
        ],
        submitter: { full_name: 'Staff' },
        approver: null,
        proposer: null,
        completer: null,
      },
      {
        id: 'submission-2',
        project_id: 'project-1',
        workflow_type: UnitResponsibleType.CONTRACT,
        step_order: 2,
        status: SubmissionStatus.WAITING_SIGNATURE,
        documents: [
          { field_key: 'contract', file_name: 'b.pdf', file_path: 'b.pdf' },
        ],
        submitter: null,
        approver: null,
        proposer: { full_name: 'Document Staff' },
        completer: null,
      },
    ]);

    const result = await getProjectSubmissions(user, 'project-1');

    expect(result.procurement[0]).toMatchObject({
      step_order: 1,
      step_status: SubmissionStatus.COMPLETED,
    });
    expect(result.contract[1]).toMatchObject({
      step_order: 2,
      step_status: SubmissionStatus.WAITING_SIGNATURE,
    });
    expect(mockedDownloadUrl).toHaveBeenCalledWith('a.pdf');
    expect(result.procurement[0].data[0].documents[0].download_url).toBe(
      'https://files.test/a.pdf'
    );
  });

  it('getVendorSubmissions returns paginated vendor submissions with flattened project fields', async () => {
    prismaMock.projectSubmission.findMany.mockResolvedValue([
      {
        id: 'submission-1',
        po_no: 'PO-1',
        submitted_at: new Date('2026-06-01T00:00:00.000Z'),
        documents: [
          {
            field_key: 'invoice',
            file_name: 'invoice.pdf',
            file_path: 'invoice.pdf',
          },
        ],
        project: {
          id: 'project-1',
          receive_no: '2569/00001',
          title: 'Contract work',
          vendor_name: 'Vendor Co',
          requesting_dept: { id: 'dept-1', name: 'Requester Dept' },
        },
      },
    ]);
    prismaMock.projectSubmission.count.mockResolvedValue(1);

    const result = await getVendorSubmissions(user, 1, 10, {
      search: 'Vendor',
      dateFrom: new Date('2026-06-01'),
      dateTo: new Date('2026-06-01'),
    } as any);

    expect(result.total).toBe(1);
    expect(result.data[0]).toMatchObject({
      project_id: 'project-1',
      title: 'Contract work',
      receive_no: '2569/00001',
      vendor_name: 'Vendor Co',
      requester: { dept_id: 'dept-1', dept_name: 'Requester Dept' },
    });
    expect(prismaMock.projectSubmission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 10,
        orderBy: { submitted_at: 'desc' },
      })
    );
  });

  it('createStaffSubmissionsProject creates a waiting-approval submission under an advisory lock and syncs phases', async () => {
    txMock.project.findUnique.mockResolvedValue({
      id: 'project-1',
      current_workflow_type: UnitResponsibleType.LT100K,
    });
    txMock.projectSubmission.findFirst.mockResolvedValue(null);
    txMock.projectSubmission.create.mockResolvedValue({
      id: 'submission-1',
      project_id: 'project-1',
      workflow_type: UnitResponsibleType.LT100K,
      step_order: 1,
      submission_round: 1,
      status: SubmissionStatus.WAITING_APPROVAL,
    });

    const result = await createStaffSubmissionsProject(
      user,
      staffSubmissionDto()
    );

    expect(result.status).toBe(SubmissionStatus.WAITING_APPROVAL);
    expect(txMock.$executeRaw).toHaveBeenCalledTimes(1);
    expect(txMock.projectSubmission.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          submission_round: 1,
          status: SubmissionStatus.WAITING_APPROVAL,
          submission_type: SubmissionType.STAFF,
        }),
      })
    );
    expect(mockedSyncProjectPhases).toHaveBeenCalledWith(
      txMock,
      UnitResponsibleType.LT100K,
      'project-1'
    );
  });

  it('createStaffSubmissionsProject creates a completed submission when approval is not required', async () => {
    txMock.project.findUnique.mockResolvedValue({
      id: 'project-1',
      current_workflow_type: UnitResponsibleType.LT100K,
    });
    txMock.projectSubmission.findFirst.mockResolvedValue({
      submission_round: 2,
    });
    txMock.projectSubmission.create.mockResolvedValue({
      id: 'submission-3',
      project_id: 'project-1',
      workflow_type: UnitResponsibleType.LT100K,
      step_order: 1,
      submission_round: 3,
      status: SubmissionStatus.COMPLETED,
    });

    const result = await createStaffSubmissionsProject(
      user,
      staffSubmissionDto({ required_approval: false })
    );

    expect(result.status).toBe(SubmissionStatus.COMPLETED);
    expect(txMock.projectSubmission.create.mock.calls[0][0].data.status).toBe(
      SubmissionStatus.COMPLETED
    );
  });

  it('createStaffSubmissionsProject rejects workflow mismatches before creating a submission', async () => {
    txMock.project.findUnique.mockResolvedValue({
      id: 'project-1',
      current_workflow_type: UnitResponsibleType.CONTRACT,
    });

    await expect(
      createStaffSubmissionsProject(user, staffSubmissionDto())
    ).rejects.toBeInstanceOf(BadRequestError);
    expect(txMock.projectSubmission.create).not.toHaveBeenCalled();
  });

  it('createVendorSubmissionsProject resolves project by PO, locks the round, and syncs phases', async () => {
    txMock.project.findFirstOrThrow.mockResolvedValue({
      id: 'project-1',
      current_workflow_type: UnitResponsibleType.CONTRACT,
    });
    txMock.projectSubmission.findFirst.mockResolvedValue(null);
    txMock.projectSubmission.create.mockResolvedValue({
      id: 'submission-1',
      project_id: 'project-1',
      workflow_type: UnitResponsibleType.CONTRACT,
      step_order: 2,
      submission_round: 1,
      status: SubmissionStatus.COMPLETED,
    });

    const result = await createVendorSubmissionsProject({
      type: SubmissionType.VENDOR,
      workflow_type: UnitResponsibleType.CONTRACT,
      step_order: 2,
      po_no: 'PO-1',
      installment: 1,
      files: [
        {
          field_key: 'invoice',
          file_name: 'invoice.pdf',
          file_path: 'invoice.pdf',
        },
      ],
    });

    expect(result.status).toBe(SubmissionStatus.COMPLETED);
    expect(txMock.$executeRaw).toHaveBeenCalledTimes(1);
    expect(mockedSyncProjectPhases).toHaveBeenCalledWith(
      txMock,
      UnitResponsibleType.CONTRACT,
      'project-1'
    );
  });

  it('createVendorSubmissionsProject maps missing PO projects to NotFoundError', async () => {
    txMock.project.findFirstOrThrow.mockRejectedValue(new Error('missing'));

    await expect(
      createVendorSubmissionsProject({
        type: SubmissionType.VENDOR,
        workflow_type: UnitResponsibleType.CONTRACT,
        step_order: 2,
        po_no: 'PO-404',
        files: [],
      })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('approveSubmission moves waiting-approval submissions to completed when no signature is required', async () => {
    txMock.projectSubmission.findUnique.mockResolvedValue({
      status: SubmissionStatus.WAITING_APPROVAL,
      submitted_by: 'submitter-1',
    });
    txMock.projectSubmission.update.mockResolvedValue({
      id: 'submission-1',
      project_id: 'project-1',
      workflow_type: UnitResponsibleType.LT100K,
      step_order: 1,
      submission_round: 1,
      status: SubmissionStatus.COMPLETED,
      completed_by: user.id,
    });

    const result = await approveSubmission(user, {
      id: 'submission-1',
      required_signature: false,
    } as any);

    expect(result.status).toBe(SubmissionStatus.COMPLETED);
    expect(txMock.projectSubmission.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: SubmissionStatus.COMPLETED,
          completed_by: user.id,
        }),
      })
    );
    expect(mockedSyncProjectPhases).toHaveBeenCalledWith(
      txMock,
      UnitResponsibleType.LT100K,
      'project-1'
    );
  });

  it('approveSubmission rejects submissions that are not waiting approval', async () => {
    txMock.projectSubmission.findUnique.mockResolvedValue({
      status: SubmissionStatus.COMPLETED,
      submitted_by: 'submitter-1',
    });

    await expect(
      approveSubmission(user, {
        id: 'submission-1',
        required_signature: true,
      } as any)
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('proposeSubmission moves waiting-proposal submissions to waiting signature', async () => {
    txMock.projectSubmission.findUnique.mockResolvedValue({
      status: SubmissionStatus.WAITING_PROPOSAL,
    });
    txMock.projectSubmission.update.mockResolvedValue({
      id: 'submission-1',
      project_id: 'project-1',
      workflow_type: UnitResponsibleType.LT100K,
      step_order: 1,
      submission_round: 1,
      status: SubmissionStatus.WAITING_SIGNATURE,
    });

    const result = await proposeSubmission(user, 'submission-1');

    expect(result.status).toBe(SubmissionStatus.WAITING_SIGNATURE);
    expect(mockedSyncProjectPhases).toHaveBeenCalled();
  });

  it('signAndCompleteSubmission completes the submission and updates project fields when required', async () => {
    txMock.projectSubmission.findUnique.mockResolvedValue({
      status: SubmissionStatus.WAITING_SIGNATURE,
      submitted_by: 'submitter-1',
      meta_data: [{ field_key: 'po_no', value: 'PO-2' }],
    });
    txMock.projectSubmission.update.mockResolvedValue({
      id: 'submission-1',
      project_id: 'project-1',
      workflow_type: UnitResponsibleType.CONTRACT,
      step_order: 2,
      submission_round: 1,
      status: SubmissionStatus.COMPLETED,
    });
    txMock.project.findUnique.mockResolvedValue({
      id: 'project-1',
      po_no: 'PO-1',
      pr_no: null,
      less_no: null,
      contract_no_id: null,
      migo_103_no: null,
      migo_105_no: null,
      asset_code: null,
      vendor_name: null,
      vendor_email: null,
    });

    const result = await signAndCompleteSubmission(user, {
      id: 'submission-1',
      required_updating: true,
    } as any);

    expect(result.status).toBe(SubmissionStatus.COMPLETED);
    expect(txMock.project.update).toHaveBeenCalledWith({
      where: { id: 'project-1' },
      data: { po_no: 'PO-2' },
    });
    expect(txMock.projectHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          old_value: { po_no: 'PO-1' },
          new_value: { po_no: 'PO-2' },
        }),
      })
    );
  });

  it('signAndCompleteSubmission rejects submissions that are not waiting signature', async () => {
    txMock.projectSubmission.findUnique.mockResolvedValue({
      status: SubmissionStatus.WAITING_PROPOSAL,
      submitted_by: 'submitter-1',
      meta_data: [],
    });

    await expect(
      signAndCompleteSubmission(user, {
        id: 'submission-1',
        required_updating: false,
      } as any)
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejectSubmission stores the comment and syncs phases', async () => {
    txMock.projectSubmission.update.mockResolvedValue({
      id: 'submission-1',
      project_id: 'project-1',
      workflow_type: UnitResponsibleType.LT100K,
      step_order: 1,
      submission_round: 1,
      status: SubmissionStatus.REJECTED,
      comment: 'Please revise',
    });

    const result = await rejectSubmission(user, {
      id: 'submission-1',
      comment: 'Please revise',
    } as any);

    expect(result.status).toBe(SubmissionStatus.REJECTED);
    expect(txMock.projectSubmission.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: SubmissionStatus.REJECTED,
          comment: 'Please revise',
          approved_by: user.id,
        }),
      })
    );
    expect(mockedSyncProjectPhases).toHaveBeenCalledWith(
      txMock,
      UnitResponsibleType.LT100K,
      'project-1'
    );
  });
});
