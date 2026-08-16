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

vi.mock('../notification/notification-realtime.service', () => ({
  publishNotificationRealtimeEvent: vi.fn().mockResolvedValue(undefined),
}));

const mockedSyncProjectPhases = vi.mocked(syncProjectPhases);
const mockedDownloadUrl = vi.mocked(generatePresignedDownloadUrl);

const user = {
  id: 'user-1',
  full_name: 'Staff User',
  roles: [{ role: 'SUPER_ADMIN' }],
} as any;

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
      installment_rounds: 2,
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
        installment_no: 1,
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
    expect(result.contract).toHaveLength(2);
    expect(result.contract[0].steps[1]).toMatchObject({
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

  it('getVendorSubmissions filters by receiveNo, poNo, and vendorName', async () => {
    prismaMock.projectSubmission.findMany.mockResolvedValue([]);
    prismaMock.projectSubmission.count.mockResolvedValue(0);

    await getVendorSubmissions(user, 1, 10, {
      receiveNo: '2569/00001',
      poNo: '1234567890',
      vendorName: 'Acme',
    });

    const findManyCall =
      prismaMock.projectSubmission.findMany.mock.calls.at(-1)?.[0];
    expect(findManyCall?.where).toEqual({
      AND: [
        { submission_type: 'VENDOR' },
        { workflow_type: 'CONTRACT' },
        {
          project: {
            receive_no: { contains: '2569/00001', mode: 'insensitive' },
          },
        },
        {
          OR: [
            { po_no: { contains: '1234567890', mode: 'insensitive' } },
            {
              project: {
                po_no: { contains: '1234567890', mode: 'insensitive' },
              },
            },
          ],
        },
        { project: { vendor_name: { contains: 'Acme', mode: 'insensitive' } } },
      ],
    });
  });

  it('createStaffSubmissionsProject creates a waiting-approval submission under an advisory lock and syncs phases', async () => {
    txMock.project.findUnique.mockResolvedValue({
      id: 'project-1',
      current_workflow_type: UnitResponsibleType.LT100K,
      installment_rounds: 1,
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
      installment_rounds: 1,
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
      installment_rounds: 1,
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
      installment_rounds: 2,
    });
    txMock.project.findUnique.mockResolvedValue({
      id: 'project-1',
      title: 'Project 1',
      responsible_unit_id: 'unit-1',
      created_by: 'user-1',
      assignee_procurement: [],
      assignee_contract: [
        { id: 'contract-1', full_name: 'Contract One', email: null },
      ],
      creator: { id: 'user-1', full_name: 'User One', email: null },
    });
    txMock.userOrganizationRole.findMany.mockResolvedValue([
      {
        user: { id: 'finance-1', full_name: 'Finance One', email: null },
      },
    ]);
    txMock.userDelegation.findMany.mockResolvedValue([]);
    txMock.user.findMany.mockImplementation(async (args: any) => {
      const ids = args?.where?.id?.in ?? [];
      return ids.map((id: string) => ({ id }));
    });
    txMock.notification.findFirst.mockResolvedValue(null);
    txMock.notification.create
      .mockResolvedValueOnce({
        id: 'notification-contract-1',
        user_id: 'contract-1',
        project_id: 'project-1',
        category: 'VENDOR_SUBMISSIONS',
        priority: 'HIGH',
        title: 'ผู้ค้าส่งเอกสารแล้ว',
        body: 'ผู้ค้าได้ส่งเอกสารสำหรับโครงการ "Project 1" แล้ว',
        target_path: '/app/vendor-response',
        action_label: 'เปิดรายการ',
        requires_action: true,
        is_read: false,
        read_at: null,
        created_at: new Date('2026-06-01T00:00:00.000Z'),
        metadata: { notification_kind: 'ASSIGNED_DOCUMENT' },
      })
      .mockResolvedValueOnce({
        id: 'notification-finance-1',
        user_id: 'finance-1',
        project_id: 'project-1',
        category: 'FINANCE_HANDOFFS',
        priority: 'MEDIUM',
        title: 'มีงานพร้อมส่งต่อการเงิน',
        body: 'โครงการ "Project 1" มีเอกสารจากผู้ค้าพร้อมสำหรับขั้นตอนการเงิน',
        target_path: '/app/projects/project-1',
        action_label: 'เปิดโครงการ',
        requires_action: false,
        is_read: false,
        read_at: null,
        created_at: new Date('2026-06-01T00:00:00.000Z'),
        metadata: { notification_kind: 'FINANCE_SUBMIT' },
      });
    txMock.notification.groupBy.mockResolvedValue([
      { user_id: 'contract-1', _count: { _all: 1 } },
      { user_id: 'finance-1', _count: { _all: 1 } },
    ]);
    txMock.projectSubmission.findFirst.mockResolvedValue(null);
    txMock.projectSubmission.create.mockResolvedValue({
      id: 'submission-1',
      project_id: 'project-1',
      workflow_type: UnitResponsibleType.CONTRACT,
      step_order: 2,
      submission_round: 1,
      installment_no: 1,
      status: SubmissionStatus.COMPLETED,
    });

    const result = await createVendorSubmissionsProject({
      type: SubmissionType.VENDOR,
      workflow_type: UnitResponsibleType.CONTRACT,
      step_order: 2,
      po_no: 'PO-1',
      installment_no: 1,
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
    expect(txMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          user_id: 'contract-1',
          category: 'VENDOR_SUBMISSIONS',
          dedupe_key: 'vendor-submission:submission-1',
          metadata: expect.objectContaining({
            notification_kind: 'ASSIGNED_DOCUMENT',
          }),
        }),
      })
    );
    expect(txMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          user_id: 'finance-1',
          category: 'FINANCE_HANDOFFS',
          dedupe_key: 'finance-handoff:submission-1',
          metadata: expect.objectContaining({
            notification_kind: 'FINANCE_SUBMIT',
          }),
        }),
      })
    );
    expect(txMock.notification.create).toHaveBeenCalledTimes(2);
  });

  it('createStaffSubmissionsProject requires installment number for contract workflow', async () => {
    txMock.project.findUnique.mockResolvedValue({
      id: 'project-1',
      current_workflow_type: UnitResponsibleType.CONTRACT,
      installment_rounds: 2,
    });

    await expect(
      createStaffSubmissionsProject(
        user,
        staffSubmissionDto({
          workflow_type: UnitResponsibleType.CONTRACT,
        })
      )
    ).rejects.toBeInstanceOf(BadRequestError);
    expect(txMock.projectSubmission.create).not.toHaveBeenCalled();
  });

  it('createVendorSubmissionsProject rejects installment numbers outside project range', async () => {
    txMock.project.findFirstOrThrow.mockResolvedValue({
      id: 'project-1',
      current_workflow_type: UnitResponsibleType.CONTRACT,
      installment_rounds: 2,
    });

    await expect(
      createVendorSubmissionsProject({
        type: SubmissionType.VENDOR,
        workflow_type: UnitResponsibleType.CONTRACT,
        step_order: 2,
        po_no: 'PO-1',
        installment_no: 3,
        files: [],
      })
    ).rejects.toBeInstanceOf(BadRequestError);
    expect(txMock.projectSubmission.create).not.toHaveBeenCalled();
  });

  it('createStaffSubmissionsProject increments submission rounds independently per installment', async () => {
    txMock.project.findUnique.mockResolvedValue({
      id: 'project-1',
      current_workflow_type: UnitResponsibleType.CONTRACT,
      installment_rounds: 2,
    });
    txMock.projectSubmission.findFirst.mockResolvedValue({
      submission_round: 1,
    });
    txMock.projectSubmission.create.mockResolvedValue({
      id: 'submission-2',
      project_id: 'project-1',
      workflow_type: UnitResponsibleType.CONTRACT,
      step_order: 1,
      submission_round: 2,
      installment_no: 2,
      status: SubmissionStatus.COMPLETED,
    });

    const result = await createStaffSubmissionsProject(
      user,
      staffSubmissionDto({
        workflow_type: UnitResponsibleType.CONTRACT,
        installment_no: 2,
        required_approval: false,
      })
    );

    expect(result.submission_round).toBe(2);
    expect(txMock.projectSubmission.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          installment_no: 2,
        }),
      })
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
        installment_no: 1,
        files: [],
      })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('approveSubmission moves waiting-approval submissions to completed when no signature is required', async () => {
    txMock.projectSubmission.findUnique.mockResolvedValue({
      status: SubmissionStatus.WAITING_APPROVAL,
      submitted_by: 'submitter-1',
    });
    txMock.project.findUnique.mockResolvedValue({
      id: 'project-1',
      title: 'Project 1',
      responsible_unit_id: 'unit-1',
      created_by: 'user-1',
      assignee_procurement: [],
      assignee_contract: [],
      creator: { id: 'user-1', full_name: 'User One', email: null },
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
      current_workflow_type: UnitResponsibleType.CONTRACT,
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

  it('rejects installment-round changes from submission metadata outside CONTRACT workflow', async () => {
    txMock.projectSubmission.findUnique.mockResolvedValue({
      status: SubmissionStatus.WAITING_SIGNATURE,
      submitted_by: 'submitter-1',
      meta_data: [{ field_key: 'installment_rounds', value: 2 }],
    });
    txMock.projectSubmission.update.mockResolvedValue({
      id: 'submission-1',
      project_id: 'project-1',
      workflow_type: UnitResponsibleType.LT100K,
      step_order: 1,
      submission_round: 1,
      status: SubmissionStatus.COMPLETED,
    });
    txMock.project.findUnique.mockResolvedValue({
      id: 'project-1',
      pr_no: null,
      po_no: null,
      less_no: null,
      contract_no_id: null,
      migo_103_no: null,
      migo_105_no: null,
      asset_code: null,
      vendor_name: null,
      vendor_email: null,
      installment_rounds: 1,
      current_workflow_type: UnitResponsibleType.LT100K,
    });

    await expect(
      signAndCompleteSubmission(user, {
        id: 'submission-1',
        required_updating: true,
      } as any)
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejectSubmission stores the comment, syncs phases, and notifies the submitter', async () => {
    txMock.project.findUnique.mockResolvedValue({
      id: 'project-1',
      title: 'Project 1',
      responsible_unit_id: 'unit-1',
      created_by: 'user-1',
      assignee_procurement: [],
      assignee_contract: [],
      creator: { id: 'user-1', full_name: 'User One', email: null },
    });
    txMock.user.findMany.mockResolvedValue([{ id: 'submitter-1' }]);
    txMock.notification.findFirst.mockResolvedValue(null);
    txMock.notification.create.mockResolvedValue({
      id: 'notification-1',
      user_id: 'submitter-1',
      project_id: 'project-1',
      category: 'WORKFLOW_UPDATES',
      priority: 'HIGH',
      title: 'ขั้นตอนถูกตีกลับ',
      body: 'ขั้นตอนที่ 1 ของโครงการ "Project 1" ถูกตีกลับ: Please revise',
      target_path: '/app/projects/project-1',
      action_label: 'เปิดโครงการ',
      requires_action: true,
      is_read: false,
      read_at: null,
      created_at: new Date('2026-06-01T00:00:00.000Z'),
      metadata: { notification_kind: 'SUBMISSION_REJECTED' },
    });
    txMock.notification.groupBy.mockResolvedValue([
      { user_id: 'submitter-1', _count: { _all: 1 } },
    ]);
    txMock.projectSubmission.update.mockResolvedValue({
      id: 'submission-1',
      project_id: 'project-1',
      workflow_type: UnitResponsibleType.LT100K,
      step_order: 1,
      submission_round: 1,
      submitted_by: 'submitter-1',
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
    expect(txMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          user_id: 'submitter-1',
          project_id: 'project-1',
          requires_action: true,
          title: 'ขั้นตอนถูกตีกลับ',
          metadata: expect.objectContaining({
            notification_kind: 'SUBMISSION_REJECTED',
          }),
        }),
      })
    );
  });
});
