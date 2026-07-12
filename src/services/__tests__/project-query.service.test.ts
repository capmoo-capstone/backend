import {
  ProcurementType,
  ProjectPhaseStatus,
  ProjectStatus,
  SubmissionStatus,
  SubmissionType,
  UnitResponsibleType,
  UrgentType,
  UserRole,
} from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OPS_DEPT_ID, PROC1_UNIT_ID } from '../../lib/constant';
import { prismaMock, txMock } from '../../test/prisma-mock';
import {
  getAssignedProjects,
  getById,
  getDocumentSummary,
  getOwnProjects,
  getSummaryCards,
  getUnassignedProjectsByUnit,
  getWorkload,
  listProjects,
} from '../project-query.service';

vi.mock('../storage.service', () => ({
  generatePresignedDownloadUrl: vi.fn(
    async (key: string) => `https://files.test/${key}`
  ),
}));

const supplyUser = {
  id: 'head-1',
  is_delegated: false,
  delegated_by: [],
  roles: [
    { role: UserRole.HEAD_OF_DEPARTMENT, dept_id: OPS_DEPT_ID, unit_id: null },
  ],
} as any;

const externalUser = {
  id: 'rep-1',
  is_delegated: false,
  delegated_by: [],
  roles: [
    {
      role: UserRole.REPRESENTATIVE,
      dept_id: 'dept-1',
      unit_id: 'unit-request',
    },
  ],
} as any;

const headUnitUser = {
  id: 'head-unit-1',
  is_delegated: false,
  delegated_by: [],
  roles: [
    {
      role: UserRole.HEAD_OF_UNIT,
      dept_id: OPS_DEPT_ID,
      unit_id: PROC1_UNIT_ID,
    },
  ],
} as any;

const staffUser = {
  id: 'staff-1',
  is_delegated: false,
  delegated_by: [],
  roles: [
    {
      role: UserRole.GENERAL_STAFF,
      dept_id: OPS_DEPT_ID,
      unit_id: PROC1_UNIT_ID,
    },
  ],
} as any;

const documentUser = {
  id: 'document-1',
  is_delegated: false,
  delegated_by: [],
  roles: [
    {
      role: UserRole.DOCUMENT_STAFF,
      dept_id: OPS_DEPT_ID,
      unit_id: null,
    },
  ],
} as any;

const financeUser = {
  id: 'finance-1',
  is_delegated: false,
  delegated_by: [],
  roles: [
    {
      role: UserRole.FINANCE_STAFF,
      dept_id: OPS_DEPT_ID,
      unit_id: null,
    },
  ],
} as any;

const unsupportedSupplyUser = {
  id: 'admin-1',
  is_delegated: false,
  delegated_by: [],
  roles: [
    {
      role: UserRole.ADMIN,
      dept_id: OPS_DEPT_ID,
      unit_id: null,
    },
  ],
} as any;

const multiRoleUser = {
  id: 'staff-1',
  is_delegated: false,
  delegated_by: [],
  roles: [
    {
      role: UserRole.GENERAL_STAFF,
      dept_id: OPS_DEPT_ID,
      unit_id: PROC1_UNIT_ID,
    },
    {
      role: UserRole.DOCUMENT_STAFF,
      dept_id: OPS_DEPT_ID,
      unit_id: null,
    },
  ],
} as any;

const projectRow = {
  id: 'project-1',
  receive_no: '2569/00001',
  title: 'Project One',
  status: ProjectStatus.IN_PROGRESS,
  budget: 1000,
  procurement_type: ProcurementType.LT100K,
  current_workflow_type: UnitResponsibleType.LT100K,
  assignee_procurement: [{ id: 'staff-1', full_name: 'Staff One' }],
  assignee_contract: [],
};

const mockOwnProjectPage = (total = 1) => {
  prismaMock.project.findMany.mockResolvedValue([projectRow]);
  prismaMock.project.count.mockResolvedValue(total);
};

const ownProjectWhere = () =>
  prismaMock.project.findMany.mock.calls.at(-1)[0].where;

const ownProjectWhereJson = () => JSON.stringify(ownProjectWhere());

describe('project-query.service', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'));
  });

  it('listProjects for supply users returns all projects within the default 6-month window', async () => {
    prismaMock.project.findMany.mockResolvedValue([projectRow]);
    prismaMock.project.count.mockResolvedValue(1);

    const result = await listProjects(supplyUser, 1, 10);

    expect(result.total).toBe(1);
    const where = prismaMock.project.findMany.mock.calls[0][0].where;

    const expectedDate = new Date('2026-06-01T00:00:00.000Z');
    expectedDate.setHours(0, 0, 0, 0);
    expectedDate.setMonth(expectedDate.getMonth() - 6);

    expect(where.AND).toEqual([{ created_at: { gte: expectedDate } }]);
  });

  it('listProjects for external users scopes to their requesting departments', async () => {
    prismaMock.project.findMany.mockResolvedValue([]);
    prismaMock.project.count.mockResolvedValue(0);

    await listProjects(externalUser, 1, 10);

    expect(
      prismaMock.project.findMany.mock.calls[0][0].where.AND
    ).toContainEqual({
      requesting_dept_id: { in: ['dept-1'] },
    });
  });

  it('getById returns full project details for supply users', async () => {
    txMock.project.findUnique.mockResolvedValue({
      ...projectRow,
      description: 'Description',
      responsible_unit_id: PROC1_UNIT_ID,
      is_urgent: UrgentType.NORMAL,
      procurement_progress: {},
      contract_progress: {},
      installment_rounds: 1,
      budget_plans: [],
      less_no: null,
      pr_no: 'PR-1',
      po_no: null,
      contract_no: null,
      migo_103_no: null,
      migo_105_no: null,
      asset_code: null,
      expected_approval_date: null,
      expected_completion_procurement_date: null,
      request_edit_reason: null,
      created_at: new Date('2026-06-01T00:00:00.000Z'),
      updated_at: new Date('2026-06-01T00:00:00.000Z'),
      vendor_name: 'Vendor Co',
      vendor_email: 'vendor@example.test',
      requesting_dept: { id: 'dept-1', name: 'Dept One' },
      requesting_unit: { id: 'unit-1', name: 'Unit One' },
      creator: { id: 'creator-1', full_name: 'Creator' },
      project_cancellation: [],
    });

    const result = await getById(supplyUser, 'project-1');

    expect(result).toMatchObject({
      id: 'project-1',
      requester: {
        dept_id: 'dept-1',
        unit_id: 'unit-1',
      },
      vendor: {
        name: 'Vendor Co',
        email: 'vendor@example.test',
      },
    });
  });

  it('getUnassignedProjectsByUnit allows head-of-department users to query any unit', async () => {
    prismaMock.unit.findUnique.mockResolvedValue({
      type: [UnitResponsibleType.LT100K],
    });
    prismaMock.project.findMany.mockResolvedValue([projectRow]);
    prismaMock.project.count.mockResolvedValue(1);

    const result = await getUnassignedProjectsByUnit(supplyUser, PROC1_UNIT_ID);

    expect(result.total).toBe(1);
    expect(prismaMock.project.findMany.mock.calls[0][0].where).toMatchObject({
      status: { in: [ProjectStatus.UNASSIGNED] },
      current_workflow_type: { in: [UnitResponsibleType.LT100K] },
    });
  });

  it('getAssignedProjects returns staff-assigned projects with flattened assignee data', async () => {
    prismaMock.project.findMany.mockResolvedValue([projectRow]);
    prismaMock.project.count.mockResolvedValue(1);

    const result = await getAssignedProjects(staffUser, new Date('2026-06-01'));

    expect((result.data[0] as any).assignee).toEqual([
      { id: 'staff-1', full_name: 'Staff One' },
    ]);
    expect(prismaMock.project.findMany.mock.calls[0][0].where.AND).toEqual(
      expect.arrayContaining([
        {
          OR: [
            { assignee_procurement: { some: { id: 'staff-1' } } },
            { assignee_contract: { some: { id: 'staff-1' } } },
          ],
        },
      ])
    );
  });

  describe('getOwnProjects role tabs', () => {
    it('returns all projects for super/supply head users on the all tab', async () => {
      mockOwnProjectPage();

      const result = await getOwnProjects(supplyUser, 1, 10);

      expect(result.total).toBe(1);
      expect(ownProjectWhere()).toEqual({});
    });

    it('preserves broad urgency filtering for super/supply head users', async () => {
      mockOwnProjectPage();

      await getOwnProjects(supplyUser, 1, 10, 'super_urgent');

      expect(ownProjectWhere()).toEqual({
        is_urgent: UrgentType.SUPER_URGENT,
      });
    });

    it('scopes general staff all tab to assigned projects in matching workflow types', async () => {
      prismaMock.unit.findMany.mockResolvedValue([
        { id: PROC1_UNIT_ID, type: [UnitResponsibleType.LT100K] },
      ]);
      mockOwnProjectPage();

      await getOwnProjects(staffUser, 1, 10);

      expect(ownProjectWhere()).toEqual({
        AND: [
          { current_workflow_type: { in: [UnitResponsibleType.LT100K] } },
          { assignee_procurement: { some: { id: 'staff-1' } } },
        ],
      });
    });

    it('filters general staff waiting_accept by project status', async () => {
      prismaMock.unit.findMany.mockResolvedValue([
        { id: PROC1_UNIT_ID, type: [UnitResponsibleType.LT100K] },
      ]);
      mockOwnProjectPage();

      await getOwnProjects(staffUser, 1, 10, 'waiting_accept');

      expect(ownProjectWhere()).toMatchObject({
        AND: [expect.any(Object), { status: ProjectStatus.WAITING_ACCEPT }],
      });
    });

    it('filters general staff need_action to non-completed own progress', async () => {
      prismaMock.unit.findMany.mockResolvedValue([
        { id: PROC1_UNIT_ID, type: [UnitResponsibleType.LT100K] },
      ]);
      mockOwnProjectPage();

      await getOwnProjects(staffUser, 1, 10, 'need_action');

      expect(ownProjectWhereJson()).toContain(
        `"equals":"${ProjectPhaseStatus.NOT_STARTED}"`
      );
      expect(ownProjectWhereJson()).toContain(
        `"equals":"${ProjectPhaseStatus.REJECTED}"`
      );
      expect(ownProjectWhereJson()).not.toContain(
        `"equals":"${ProjectPhaseStatus.COMPLETED}"`
      );
    });

    it('filters general staff rejected tab to rejected own progress', async () => {
      prismaMock.unit.findMany.mockResolvedValue([
        { id: PROC1_UNIT_ID, type: [UnitResponsibleType.LT100K] },
      ]);
      mockOwnProjectPage();

      await getOwnProjects(staffUser, 1, 10, 'rejected');

      expect(ownProjectWhereJson()).toContain(
        '"path":["GENERAL_STAFF","status"]'
      );
      expect(ownProjectWhereJson()).toContain(
        `"equals":"${ProjectPhaseStatus.REJECTED}"`
      );
    });

    it('scopes head-of-unit all tab to projects in their unit workflow types', async () => {
      prismaMock.unit.findMany.mockResolvedValue([
        { id: PROC1_UNIT_ID, type: [UnitResponsibleType.LT100K] },
      ]);
      mockOwnProjectPage();

      await getOwnProjects(headUnitUser, 1, 10);

      expect(ownProjectWhere()).toEqual({
        AND: [
          { responsible_unit_id: PROC1_UNIT_ID },
          { current_workflow_type: { in: [UnitResponsibleType.LT100K] } },
        ],
      });
    });

    it('filters head-of-unit waiting_approval to own progress approval state', async () => {
      prismaMock.unit.findMany.mockResolvedValue([
        { id: PROC1_UNIT_ID, type: [UnitResponsibleType.LT100K] },
      ]);
      mockOwnProjectPage();

      await getOwnProjects(headUnitUser, 1, 10, 'waiting_approval');

      expect(ownProjectWhereJson()).toContain(
        '"path":["HEAD_OF_UNIT","status"]'
      );
      expect(ownProjectWhereJson()).toContain(
        `"equals":"${ProjectPhaseStatus.WAITING_APPROVAL}"`
      );
    });

    it('filters head-of-unit waiting_cancel by project status', async () => {
      prismaMock.unit.findMany.mockResolvedValue([
        { id: PROC1_UNIT_ID, type: [UnitResponsibleType.LT100K] },
      ]);
      mockOwnProjectPage();

      await getOwnProjects(headUnitUser, 1, 10, 'waiting_cancel');

      expect(ownProjectWhere()).toMatchObject({
        AND: [expect.any(Object), { status: ProjectStatus.WAITING_CANCEL }],
      });
    });

    it('filters document staff proposal and signature tabs by own progress', async () => {
      mockOwnProjectPage();

      await getOwnProjects(documentUser, 1, 10, 'waiting_proposal');
      expect(ownProjectWhereJson()).toContain(
        '"path":["DOCUMENT_STAFF","status"]'
      );
      expect(ownProjectWhereJson()).toContain(
        `"equals":"${ProjectPhaseStatus.WAITING_PROPOSAL}"`
      );

      prismaMock.project.findMany.mockClear();
      prismaMock.project.count.mockClear();
      mockOwnProjectPage();

      await getOwnProjects(documentUser, 1, 10, 'waiting_signature');
      expect(ownProjectWhereJson()).toContain(
        `"equals":"${ProjectPhaseStatus.WAITING_SIGNATURE}"`
      );
    });

    it('filters waiting_others to completed progress for progress-based roles', async () => {
      prismaMock.unit.findMany.mockResolvedValue([
        { id: PROC1_UNIT_ID, type: [UnitResponsibleType.LT100K] },
      ]);
      mockOwnProjectPage();

      await getOwnProjects(staffUser, 1, 10, 'waiting_others');

      expect(ownProjectWhereJson()).toContain(
        `"equals":"${ProjectPhaseStatus.COMPLETED}"`
      );
    });

    it('returns no waiting_others rows for finance-only users', async () => {
      mockOwnProjectPage(0);

      await getOwnProjects(financeUser, 1, 10, 'waiting_others');

      expect(ownProjectWhere()).toEqual({ id: { in: [] } });
    });

    it('applies shared urgent tabs within role scopes and unions multi-role users', async () => {
      prismaMock.unit.findMany.mockResolvedValue([
        { id: PROC1_UNIT_ID, type: [UnitResponsibleType.LT100K] },
      ]);
      mockOwnProjectPage();

      await getOwnProjects(multiRoleUser, 1, 10, 'urgent');

      expect(ownProjectWhere().OR).toHaveLength(2);
      expect(ownProjectWhereJson()).toContain(
        `"is_urgent":"${UrgentType.URGENT}"`
      );
      expect(ownProjectWhereJson()).toContain(
        '"assignee_procurement":{"some":{"id":"staff-1"}}'
      );
    });

    it('returns an empty page for unsupported supply roles', async () => {
      mockOwnProjectPage(0);

      await getOwnProjects(unsupportedSupplyUser, 1, 10);

      expect(ownProjectWhere()).toEqual({ id: { in: [] } });
    });

    it('filters finance export tab to projects with unexported finance rows', async () => {
      mockOwnProjectPage();

      await getOwnProjects(financeUser, 1, 10, 'waiting_finance_export');

      expect(ownProjectWhere()).toEqual({
        project_finance_export: { some: { is_exported: false } },
      });
    });

    it('filters finance close tab to projects exported for every installment', async () => {
      prismaMock.project.findMany
        .mockResolvedValueOnce([
          {
            id: 'partial-export',
            installment_rounds: 2,
            project_finance_export: [{ installment_no: 1, is_exported: true }],
          },
          {
            id: 'full-export',
            installment_rounds: 2,
            project_finance_export: [
              { installment_no: 1, is_exported: true },
              { installment_no: 2, is_exported: true },
            ],
          },
        ] as any)
        .mockResolvedValueOnce([projectRow]);
      prismaMock.project.count.mockResolvedValue(1);

      await getOwnProjects(financeUser, 1, 10, 'waiting_close_project');

      expect(prismaMock.project.findMany.mock.calls[0][0].where).toEqual({
        status: { not: ProjectStatus.CLOSED },
        current_workflow_type: UnitResponsibleType.CONTRACT,
        project_finance_export: { some: { is_exported: true } },
      });
      expect(ownProjectWhere()).toEqual({
        AND: [
          { id: { in: ['full-export'] } },
          { status: { not: ProjectStatus.CLOSED } },
          { current_workflow_type: UnitResponsibleType.CONTRACT },
        ],
      });
    });
  });

  it('getWorkload for head-of-department returns all units with staff workload', async () => {
    prismaMock.unit.findMany.mockResolvedValue([
      {
        id: PROC1_UNIT_ID,
        name: 'Procurement 1',
        type: [UnitResponsibleType.LT100K],
      },
    ]);
    prismaMock.project.findMany.mockResolvedValue([
      {
        responsible_unit_id: PROC1_UNIT_ID,
        current_workflow_type: UnitResponsibleType.LT100K,
        assignee_procurement: [{ id: 'staff-1', full_name: 'Staff One' }],
        assignee_contract: [],
      },
    ]);

    const result = await getWorkload(supplyUser);

    expect(result).toMatchObject({
      role: UserRole.HEAD_OF_DEPARTMENT,
      units: [
        {
          unit_id: PROC1_UNIT_ID,
          staff: [{ user_id: 'staff-1', full_name: 'Staff One', workload: 1 }],
        },
      ],
    });
  });

  it('getWorkload for head-of-unit users returns own unit workload only', async () => {
    prismaMock.unit.findUnique.mockResolvedValue({
      id: PROC1_UNIT_ID,
      name: 'Procurement 1',
    });
    prismaMock.project.findMany.mockResolvedValue([
      {
        current_workflow_type: UnitResponsibleType.CONTRACT,
        assignee_procurement: [],
        assignee_contract: [{ id: 'staff-2', full_name: 'Staff Two' }],
      },
    ]);

    const result = await getWorkload(headUnitUser);

    expect(result).toMatchObject({
      role: UserRole.HEAD_OF_UNIT,
      unit_id: PROC1_UNIT_ID,
      staff: [{ user_id: 'staff-2', full_name: 'Staff Two', workload: 1 }],
    });
  });

  it('getSummaryCards returns supply counts with unassigned and waiting accept', async () => {
    prismaMock.project.count
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(5);

    const result = await getSummaryCards(supplyUser);

    expect(result).toMatchObject({
      role: 'SUPPLY',
      total: 10,
      UNASSIGNED: 2,
      WAITING_ACCEPT: 3,
      URGENT: 5,
    });
  });

  it('getSummaryCards returns external counts scoped to the user department', async () => {
    prismaMock.project.count
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1);

    const result = await getSummaryCards(externalUser);

    expect(result).toMatchObject({
      role: 'EXTERNAL',
      total: 5,
      NOT_STARTED: 1,
      IN_PROGRESS: 2,
      URGENT: 1,
    });
    expect(prismaMock.project.count.mock.calls[0][0]).toEqual({
      where: { requesting_dept_id: { in: ['dept-1'] } },
    });
  });

  describe('getDocumentSummary', () => {
    it('throws ForbiddenError if the user does not have access to the project', async () => {
      prismaMock.project.count.mockResolvedValue(0);

      await expect(
        getDocumentSummary(externalUser, 'project-1')
      ).rejects.toThrowError('You do not have access to this project');
    });

    it('returns empty document lists for all steps if no submissions exist', async () => {
      prismaMock.project.count.mockResolvedValue(1);
      prismaMock.project.findUniqueOrThrow.mockResolvedValue({
        procurement_type: ProcurementType.LT100K,
        installment_rounds: 1,
      });
      prismaMock.projectSubmission.findMany.mockResolvedValue([]);

      const result = await getDocumentSummary(supplyUser, 'project-1');

      expect(result.procurement).toHaveLength(4);
      expect(result.contract).toHaveLength(1);
      expect(result.contract[0]).toMatchObject({
        installment_no: 1,
        steps: expect.any(Array),
      });

      expect(result.procurement[0]).toMatchObject({
        step_order: 1,
        step_status: 'NOT_STARTED',
        documents: [],
      });
    });

    it('returns approved (COMPLETED) submission documents when they exist, even if there are later non-completed rounds', async () => {
      prismaMock.project.count.mockResolvedValue(1);
      prismaMock.project.findUniqueOrThrow.mockResolvedValue({
        procurement_type: ProcurementType.LT100K,
        installment_rounds: 1,
      });

      prismaMock.projectSubmission.findMany.mockResolvedValue([
        {
          id: 'sub-round-2',
          workflow_type: UnitResponsibleType.LT100K,
          step_order: 1,
          submission_round: 2,
          status: SubmissionStatus.WAITING_APPROVAL,
          submission_type: SubmissionType.STAFF,
          documents: [
            { field_key: 'prop', file_name: 'round2.pdf', file_path: 'r2.pdf' },
          ],
        },
        {
          id: 'sub-round-1',
          workflow_type: UnitResponsibleType.LT100K,
          step_order: 1,
          submission_round: 1,
          status: SubmissionStatus.COMPLETED,
          submission_type: SubmissionType.STAFF,
          documents: [
            {
              field_key: 'prop',
              file_name: 'round1-completed.pdf',
              file_path: 'r1.pdf',
            },
          ],
        },
      ] as any);

      const result = await getDocumentSummary(supplyUser, 'project-1');

      expect(result.procurement[0].step_status).toBe(
        SubmissionStatus.WAITING_APPROVAL
      );
      expect(result.procurement[0].documents).toHaveLength(1);
      expect(result.procurement[0].documents[0]).toMatchObject({
        file_name: 'round1-completed.pdf',
        download_url: 'https://files.test/r1.pdf',
      });
    });

    it('falls back to latest submission documents if no COMPLETED submission exists for a step', async () => {
      prismaMock.project.count.mockResolvedValue(1);
      prismaMock.project.findUniqueOrThrow.mockResolvedValue({
        procurement_type: ProcurementType.LT100K,
        installment_rounds: 1,
      });

      prismaMock.projectSubmission.findMany.mockResolvedValue([
        {
          id: 'sub-round-1',
          workflow_type: UnitResponsibleType.LT100K,
          step_order: 1,
          submission_round: 1,
          status: SubmissionStatus.WAITING_APPROVAL,
          submission_type: SubmissionType.STAFF,
          documents: [
            {
              field_key: 'prop',
              file_name: 'round1-latest.pdf',
              file_path: 'r1.pdf',
            },
          ],
        },
      ] as any);

      const result = await getDocumentSummary(supplyUser, 'project-1');

      expect(result.procurement[0].step_status).toBe(
        SubmissionStatus.WAITING_APPROVAL
      );
      expect(result.procurement[0].documents).toHaveLength(1);
      expect(result.procurement[0].documents[0]).toMatchObject({
        file_name: 'round1-latest.pdf',
        download_url: 'https://files.test/r1.pdf',
      });
    });

    it('groups contract document summary by installment', async () => {
      prismaMock.project.count.mockResolvedValue(1);
      prismaMock.project.findUniqueOrThrow.mockResolvedValue({
        procurement_type: ProcurementType.LT100K,
        installment_rounds: 2,
      });

      prismaMock.projectSubmission.findMany.mockResolvedValue([
        {
          id: 'contract-installment-2',
          workflow_type: UnitResponsibleType.CONTRACT,
          installment_no: 2,
          step_order: 2,
          submission_round: 1,
          status: SubmissionStatus.COMPLETED,
          submission_type: SubmissionType.VENDOR,
          documents: [
            {
              field_key: 'invoice',
              file_name: 'installment-2.pdf',
              file_path: 'i2.pdf',
            },
          ],
        },
      ] as any);

      const result = await getDocumentSummary(supplyUser, 'project-1');

      expect(result.contract).toHaveLength(2);
      expect(result.contract[1]).toMatchObject({
        installment_no: 2,
      });
      expect(result.contract[1].steps[1]).toMatchObject({
        installment_no: 2,
        step_order: 2,
        step_status: SubmissionStatus.COMPLETED,
      });
    });
  });
});
