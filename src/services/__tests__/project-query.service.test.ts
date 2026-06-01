import {
  ProcurementType,
  ProjectStatus,
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
  getOwnProjects,
  getSummaryCards,
  getUnassignedProjectsByUnit,
  getWorkload,
  listProjects,
} from '../project-query.service';

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
    expect(where.AND).toEqual([
      { created_at: { gte: new Date('2025-12-01T00:00:00+07:00') } },
    ]);
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

  it('getOwnProjects returns all projects for super/supply admin users', async () => {
    prismaMock.project.findMany.mockResolvedValue([projectRow]);
    prismaMock.project.count.mockResolvedValue(1);

    const result = await getOwnProjects(supplyUser, 1, 10);

    expect(result.total).toBe(1);
    expect(prismaMock.project.findMany.mock.calls[0][0].where).toEqual({});
  });

  it('getOwnProjects for head-of-unit users scopes to waiting approval in their units', async () => {
    prismaMock.unit.findMany.mockResolvedValue([
      { id: PROC1_UNIT_ID, type: [UnitResponsibleType.LT100K] },
    ]);
    prismaMock.project.findMany.mockResolvedValue([]);
    prismaMock.project.count.mockResolvedValue(0);

    await getOwnProjects(headUnitUser, 1, 10);

    expect(
      prismaMock.project.findMany.mock.calls[0][0].where.OR[0].AND
    ).toEqual([
      { responsible_unit_id: { in: [PROC1_UNIT_ID] } },
      {
        procurement_progress: {
          path: ['HEAD_OF_UNIT', 'status'],
          equals: 'WAITING_APPROVAL',
        },
      },
    ]);
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
});
