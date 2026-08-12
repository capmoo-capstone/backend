import {
  ProcurementType,
  ProjectStatus,
  UnitResponsibleType,
  UserRole,
} from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OPS_DEPT_ID } from '../../lib/constant';
import { IndividualTodoQuerySchema } from '../../schemas/dashboard.schema';
import { prismaMock } from '../../test/prisma-mock';
import { AuthPayload } from '../../types/auth.type';
import * as DashboardService from '../dashboard/dashboard.service';
import {
  getDueSoonDeadlines,
  getOverdueDeadlines,
  getPeriodicSummary,
  getProcurementOverview,
} from '../dashboard/dashboard.service';

const supplyUser: AuthPayload = {
  token: 'token',
  id: 'head-1',
  username: 'head',
  full_name: 'Head User',
  is_delegated: false,
  delegated_by: [],
  roles: [
    {
      role: UserRole.HEAD_OF_DEPARTMENT,
      dept_id: OPS_DEPT_ID,
      dept_name: 'Supply',
      unit_id: null,
      unit_name: null,
    },
  ],
};

const staffUser: AuthPayload = {
  token: 'token',
  id: 'staff-1',
  username: 'staff',
  full_name: 'Staff User',
  is_delegated: false,
  delegated_by: [],
  roles: [
    {
      role: UserRole.GENERAL_STAFF,
      dept_id: OPS_DEPT_ID,
      dept_name: 'Supply',
      unit_id: 'unit-proc',
      unit_name: 'Procurement',
    },
  ],
};

const externalUser: AuthPayload = {
  token: 'token',
  id: 'rep-1',
  username: 'rep',
  full_name: 'Rep User',
  is_delegated: false,
  delegated_by: [],
  roles: [
    {
      role: UserRole.REPRESENTATIVE,
      dept_id: 'dept-1',
      dept_name: 'External Dept',
      unit_id: 'unit-request',
      unit_name: 'External Unit',
    },
  ],
};

describe('dashboard.service', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-07-12T05:00:00.000Z'));
  });

  it('returns periodic summary comparisons scoped to external user units', async () => {
    prismaMock.project.count
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(7);
    prismaMock.projectHistory.count
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(4);

    const result = await getPeriodicSummary(externalUser, {
      mode: 'month',
      dateFrom: new Date('2026-06-30T17:00:00.000Z'),
      dateTo: new Date('2026-07-31T16:59:59.999Z'),
    });

    expect(result.newWork).toEqual({
      current: 5,
      previous: 3,
      change: 2,
      trend: 'increase',
    });
    expect(result.completedWork).toEqual({
      current: 2,
      previous: 4,
      change: -2,
      trend: 'decrease',
    });
    expect(result.pendingWork.trend).toBe('same');

    expect(prismaMock.project.count.mock.calls[0][0].where).toMatchObject({
      AND: [
        { requesting_unit_id: { in: ['unit-request'] } },
        { created_at: expect.any(Object) },
      ],
    });
    expect(
      prismaMock.projectHistory.count.mock.calls[0][0].where
    ).toMatchObject({
      new_value: {
        path: ['status'],
        equals: ProjectStatus.CLOSED,
      },
      project: { requesting_unit_id: { in: ['unit-request'] } },
    });
  });

  it('uses dateFrom and dateTo ranges for periodic fiscal year summaries', async () => {
    prismaMock.project.count.mockResolvedValue(0);
    prismaMock.projectHistory.count.mockResolvedValue(0);

    const result = await getPeriodicSummary(supplyUser, {
      mode: 'fiscalYear',
      dateFrom: new Date('2025-09-30T17:00:00.000Z'),
      dateTo: new Date('2026-07-12T16:59:59.999Z'),
    });

    expect(result.range.from.toISOString()).toBe('2025-09-30T17:00:00.000Z');
    expect(result.range.to.toISOString()).toBe('2026-07-12T16:59:59.999Z');
    expect(result.previousRange.from.toISOString()).toBe(
      '2024-09-30T17:00:00.000Z'
    );
    expect(result.previousRange.to.toISOString()).toBe(
      '2025-07-12T16:59:59.999Z'
    );
  });

  it('builds procurement overview buckets for fiscal Q1', async () => {
    prismaMock.project.count.mockResolvedValue(0);
    prismaMock.projectHistory.count.mockResolvedValue(0);
    prismaMock.project.aggregate.mockResolvedValue({ _sum: { budget: null } });
    prismaMock.budgetPlan.groupBy.mockResolvedValue([
      {
        activity_type_name: 'งบประมาณแผ่นดิน',
        _count: { _all: 2 },
        _sum: { budget_amount: 1500 },
      },
      {
        activity_type_name: 'เงินรายได้',
        _count: { _all: 1 },
        _sum: { budget_amount: 500 },
      },
    ]);

    const result = await getProcurementOverview(supplyUser, {
      page: 'dashboard',
      mode: 'quarter',
      deptId: OPS_DEPT_ID,
      dateFrom: new Date('2025-09-30T17:00:00.000Z'),
      dateTo: new Date('2025-12-31T16:59:59.999Z'),
    });

    expect(result.range.from.toISOString()).toBe('2025-09-30T17:00:00.000Z');
    expect(result.range.to.toISOString()).toBe('2025-12-31T16:59:59.999Z');
    expect(result.procurementTypes).toHaveLength(6);
    expect(result.statusBar.map((point) => point.status)).toEqual([
      ProjectStatus.UNASSIGNED,
      ProjectStatus.WAITING_ACCEPT,
      ProjectStatus.IN_PROGRESS,
      ProjectStatus.CLOSED,
      ProjectStatus.CANCELLED,
    ]);
    expect(result.budgetInvestment).toEqual([
      {
        category: 'งบประมาณแผ่นดิน',
        planCount: 2,
        amount: 1500,
      },
      {
        category: 'เงินรายได้',
        planCount: 1,
        amount: 500,
      },
    ]);
    expect(result.timeline.map((point) => point.label)).toEqual([
      '2025-10',
      '2025-11',
      '2025-12',
    ]);
  });

  it('uses external status buckets and unit visibility for procurement overview', async () => {
    prismaMock.project.count.mockResolvedValue(0);
    prismaMock.projectHistory.count.mockResolvedValue(0);
    prismaMock.project.aggregate.mockResolvedValue({ _sum: { budget: null } });
    prismaMock.budgetPlan.groupBy.mockResolvedValue([]);

    const result = await getProcurementOverview(externalUser, {
      page: 'dashboard',
      mode: 'month',
      dateFrom: new Date('2026-06-30T17:00:00.000Z'),
      dateTo: new Date('2026-07-31T16:59:59.999Z'),
    });

    expect(result.statusBar.map((point) => point.status)).toEqual([
      'NOT_STARTED',
      ProjectStatus.IN_PROGRESS,
      ProjectStatus.CLOSED,
      ProjectStatus.CANCELLED,
    ]);
    expect(prismaMock.project.count.mock.calls[0][0].where).toMatchObject({
      AND: [
        { requesting_unit_id: { in: ['unit-request'] } },
        { created_at: expect.any(Object) },
        { procurement_type: ProcurementType.LT100K },
      ],
    });
  });

  it('returns null budgetPlanSummary when mode is not fiscalYear on home page', async () => {
    prismaMock.project.count.mockResolvedValue(0);
    prismaMock.projectHistory.count.mockResolvedValue(0);
    prismaMock.project.aggregate.mockResolvedValue({ _sum: { budget: null } });
    prismaMock.budgetPlan.groupBy.mockResolvedValue([]);

    const result = await getProcurementOverview(externalUser, {
      page: 'home',
      mode: 'month',
      deptId: 'dept-1',
      dateFrom: new Date('2026-06-30T17:00:00.000Z'),
      dateTo: new Date('2026-07-31T16:59:59.999Z'),
    });

    expect(result.budgetPlanSummary).toBeNull();
  });

  it('queries budget plans by fiscal year when mode is fiscalYear on home page', async () => {
    prismaMock.project.count.mockResolvedValue(0);
    prismaMock.projectHistory.count.mockResolvedValue(0);
    prismaMock.project.aggregate.mockResolvedValue({ _sum: { budget: null } });
    prismaMock.budgetPlan.groupBy.mockResolvedValue([]);
    prismaMock.budgetPlan.aggregate
      .mockResolvedValueOnce({ _sum: { budget_amount: 50000 } })
      .mockResolvedValueOnce({ _sum: { budget_amount: 30000 } });
    prismaMock.budgetPlan.count
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(2);

    const result = await getProcurementOverview(externalUser, {
      page: 'home',
      mode: 'fiscalYear',
      deptId: 'dept-1',
      dateFrom: new Date('2025-09-30T17:00:00.000Z'),
      dateTo: new Date('2026-09-30T16:59:59.999Z'),
    });

    expect(result.budgetPlanSummary).toEqual({
      totalBudget: 50000,
      usedBudget: 30000,
      totalPlans: 10,
      notStartedPlans: 3,
      inProgressPlans: 5,
      completedPlans: 2,
    });

    expect(prismaMock.budgetPlan.aggregate.mock.calls[0][0].where).toEqual({
      budget_year: 2569,
      unit: { dept_id: 'dept-1' },
      unit_id: { in: ['unit-request'] },
    });
  });

  it('returns sorted deadline pages with computed priority levels', async () => {
    vi.setSystemTime(new Date('2026-07-12T05:00:00.000Z'));
    prismaMock.holiday.findMany.mockResolvedValue([]);
    prismaMock.project.findMany
      .mockResolvedValueOnce([
        {
          id: 'late-1',
          title: 'Very late',
          expected_approval_date: new Date('2026-06-30T17:00:00.000Z'),
        },
        {
          id: 'late-2',
          title: 'Late',
          expected_approval_date: new Date('2026-07-09T17:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'soon-1',
          title: 'Urgent',
          expected_approval_date: new Date('2026-07-14T17:00:00.000Z'),
        },
        {
          id: 'soon-2',
          title: 'Watch',
          expected_approval_date: new Date('2026-07-16T17:00:00.000Z'),
        },
        {
          id: 'soon-3',
          title: 'Normal',
          expected_approval_date: new Date('2026-07-18T17:00:00.000Z'),
        },
      ]);
    prismaMock.project.count.mockResolvedValueOnce(2).mockResolvedValueOnce(3);

    const overdue = await getOverdueDeadlines(staffUser, 1, 10);
    const dueSoon = await getDueSoonDeadlines(staffUser, 1, 10);

    expect(overdue.data.map((row) => row.daysLate)).toEqual([7, 0]);
    expect(dueSoon.data.map((row) => row.priority)).toEqual([
      'URGENT',
      'WATCH',
      'WATCH',
    ]);
    expect(dueSoon.data.map((row) => row.daysRemaining)).toEqual([3, 5, 5]);
    expect(prismaMock.project.findMany.mock.calls[0][0]).toMatchObject({
      where: expect.objectContaining({
        AND: expect.arrayContaining([
          expect.objectContaining({
            current_workflow_type: {
              in: [
                'LT100K',
                'LT500K',
                'MT500K',
                'SELECTION',
                'EBIDDING',
                'INTERNAL',
              ],
            },
          }),
        ]),
      }),
      orderBy: { expected_approval_date: 'asc' },
      skip: 0,
      take: 10,
    });
  });

  it('rejects deadline access for non-supply users', async () => {
    await expect(getOverdueDeadlines(externalUser, 1, 10)).rejects.toThrowError(
      'You do not have permission to view deadlines'
    );
  });

  describe('Unit Group KPI Dashboard', () => {
    it('uses completed phase timestamps for executive metrics', async () => {
      prismaMock.unit.findUnique.mockResolvedValue({
        id: 'unit-proc',
        type: [UnitResponsibleType.LT100K],
      });
      prismaMock.holiday.findMany.mockResolvedValue([]);
      prismaMock.project.findMany
        .mockResolvedValueOnce([
          {
            id: 'p1',
            procurement_type: ProcurementType.LT100K,
            status: ProjectStatus.IN_PROGRESS,
            created_at: new Date('2026-07-01T00:00:00.000Z'),
            expected_approval_date: new Date('2026-07-07T00:00:00.000Z'),
            procurement_started_at: new Date('2026-07-01T00:00:00.000Z'),
            procurement_completed_at: new Date('2026-07-08T00:00:00.000Z'),
            contract_started_at: null,
            contract_completed_at: null,
          },
          {
            id: 'p2',
            procurement_type: ProcurementType.LT500K,
            status: ProjectStatus.CLOSED,
            created_at: new Date('2026-07-05T00:00:00.000Z'),
            expected_approval_date: new Date('2026-07-10T00:00:00.000Z'),
            procurement_started_at: new Date('2026-07-05T00:00:00.000Z'),
            procurement_completed_at: null,
            contract_started_at: null,
            contract_completed_at: null,
          },
        ])
        .mockResolvedValueOnce([]);

      const result = await DashboardService.getUnitGroupExecutiveSummary(
        staffUser,
        {
          unitId: 'unit-proc',
          mode: 'fiscalYear',
          dateFrom: new Date('2025-09-30T17:00:00.000Z'),
          dateTo: new Date('2026-07-12T16:59:59.999Z'),
        }
      );

      expect(result.unitId).toBe('unit-proc');
      expect(result.longestProcurementMethod).toBe(ProcurementType.LT100K);
      expect(result.avgDurationDays.current).toBe(5);
      expect(result.onTimeCompletionPercentage.current).toBe(0);
      expect(result.workloadVsDurationTimeline.length).toBeGreaterThan(0);
      expect(
        result.workloadVsDurationTimeline.find(
          (point) => point.label === '2026-07'
        )
      ).toMatchObject({ workloadCount: 1, avgDurationDays: 5 });
    });

    it('returns procurement metrics donut distributions', async () => {
      prismaMock.project.count
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      const result = await DashboardService.getUnitGroupProcurementMetrics(
        staffUser,
        {
          unitId: 'unit-proc',
          mode: 'fiscalYear',
          dateFrom: new Date('2025-09-30T17:00:00.000Z'),
          dateTo: new Date('2026-07-12T16:59:59.999Z'),
        }
      );

      expect(result.unitId).toBe('unit-proc');
      expect(result.totalProjects.total).toBe(1);
      expect(result.delayedProjects.total).toBe(1);
      expect(prismaMock.project.count.mock.calls[6][0].where).toMatchObject({
        AND: expect.arrayContaining([
          expect.objectContaining({
            status: { not: ProjectStatus.CANCELLED },
            expected_approval_date: { not: null },
            OR: [
              {
                procurement_completed_at: { not: null },
                expected_approval_date: {
                  lt: prismaMock.project.fields.procurement_completed_at,
                },
              },
              {
                procurement_completed_at: null,
                expected_approval_date: { lt: expect.any(Date) },
              },
            ],
          }),
        ]),
      });
    });

    it('averages completed phases from projects created in range', async () => {
      prismaMock.unit.findUnique.mockResolvedValue({
        id: 'unit-proc',
        type: [UnitResponsibleType.LT100K],
      });
      prismaMock.holiday.findMany.mockResolvedValue([
        { date: new Date('2026-07-03T00:00:00.000Z') },
      ]);
      prismaMock.project.findMany
        .mockResolvedValueOnce([
          {
            id: 'p-1',
            procurement_type: ProcurementType.LT100K,
            status: ProjectStatus.IN_PROGRESS,
            expected_approval_date: new Date('2026-07-10T00:00:00.000Z'),
            created_at: new Date('2026-07-01T00:00:00.000Z'),
            updated_at: new Date('2026-07-10T00:00:00.000Z'),
            procurement_started_at: new Date('2026-07-29T00:00:00.000Z'),
            procurement_completed_at: new Date('2026-08-04T00:00:00.000Z'),
            contract_started_at: new Date('2026-07-29T00:00:00.000Z'),
            contract_completed_at: new Date('2026-08-04T00:00:00.000Z'),
          },
        ])
        .mockResolvedValueOnce([
          {
            procurement_type: ProcurementType.LT100K,
            status: ProjectStatus.CLOSED,
            expected_approval_date: new Date('2026-07-10T00:00:00.000Z'),
            procurement_started_at: new Date('2026-06-30T17:00:00.000Z'),
            procurement_completed_at: new Date('2026-07-05T17:00:00.000Z'),
          },
        ]);

      const result = await DashboardService.getUnitGroupProcurementDetails(
        staffUser,
        {
          unitId: 'unit-proc',
          mode: 'month',
          dateFrom: new Date('2026-06-30T17:00:00.000Z'),
          dateTo: new Date('2026-07-31T16:59:59.999Z'),
        }
      );

      expect(result.methods[0].avgPhaseDurationDays).toEqual({
        procurementPhaseDays: 4,
        contractPhaseDays: 4,
      });
      expect(result.methods[0].comparisonTrend).toBe('same');
    });

    it('returns top delayed projects stage breakdown', async () => {
      prismaMock.holiday.findMany.mockResolvedValue([]);
      prismaMock.project.findMany.mockResolvedValueOnce([
        {
          id: 'p-delayed-1',
          title: 'Delayed Project 1',
          procurement_type: ProcurementType.LT100K,
          status: ProjectStatus.WAITING_CLOSE,
          created_at: new Date('2026-06-01T00:00:00.000Z'),
          updated_at: null,
          procurement_started_at: new Date('2026-07-01T00:00:00.000Z'),
          procurement_completed_at: new Date('2026-07-03T00:00:00.000Z'),
          contract_started_at: new Date('2026-07-06T00:00:00.000Z'),
          contract_completed_at: new Date('2026-07-08T00:00:00.000Z'),
          project_histories: [
            { changed_at: new Date('2026-07-09T00:00:00.000Z') },
          ],
          submissions: [
            {
              workflow_type: UnitResponsibleType.LT100K,
              status: 'COMPLETED',
              submitted_at: new Date('2026-07-01T00:00:00.000Z'),
              approved_at: new Date('2026-07-02T00:00:00.000Z'),
              completed_at: new Date('2026-07-03T00:00:00.000Z'),
            },
            {
              workflow_type: UnitResponsibleType.LT100K,
              status: 'COMPLETED',
              submitted_at: new Date('2026-07-02T00:00:00.000Z'),
              approved_at: new Date('2026-07-03T00:00:00.000Z'),
              completed_at: new Date('2026-07-04T00:00:00.000Z'),
            },
            {
              workflow_type: UnitResponsibleType.LT100K,
              status: 'COMPLETED',
              submitted_at: new Date('2026-07-04T00:00:00.000Z'),
              approved_at: null,
              completed_at: null,
            },
            {
              workflow_type: UnitResponsibleType.CONTRACT,
              status: 'REJECTED',
              submitted_at: new Date('2026-07-06T00:00:00.000Z'),
              approved_at: new Date('2026-07-08T00:00:00.000Z'),
              completed_at: null,
            },
          ],
        },
      ]);

      const result = await DashboardService.getUnitGroupTopDelayedProjects(
        staffUser,
        {
          unitId: 'unit-proc',
          procurementType: ProcurementType.LT100K,
          mode: 'fiscalYear',
          dateFrom: new Date('2025-09-30T17:00:00.000Z'),
          dateTo: new Date('2026-07-12T16:59:59.999Z'),
        }
      );

      expect(result.projects).toHaveLength(1);
      expect(result.projects[0].projectId).toBe('p-delayed-1');
      expect(result.projects[0]).toMatchObject({
        totalDays: 24,
        stageBreakdownDays: {
          assignmentDays: 22,
          procurementDays: 0,
          contractDays: 0,
          approvalDays: 2,
          financeDays: 0,
        },
      });
      const project = result.projects[0];
      expect(
        project.stageBreakdownDays.assignmentDays +
          project.stageBreakdownDays.procurementDays +
          project.stageBreakdownDays.contractDays +
          project.stageBreakdownDays.approvalDays +
          project.stageBreakdownDays.financeDays
      ).toBe(project.totalDays);
    });

    it('ends the procurement stage at procurement_completed_at', async () => {
      prismaMock.holiday.findMany.mockResolvedValue([]);
      prismaMock.project.findMany.mockResolvedValueOnce([
        {
          id: 'p-proc-complete',
          title: 'Waiting for contract',
          procurement_type: ProcurementType.LT100K,
          created_at: new Date('2026-07-01T00:00:00.000Z'),
          procurement_started_at: new Date('2026-07-02T00:00:00.000Z'),
          procurement_completed_at: new Date('2026-07-06T00:00:00.000Z'),
          contract_started_at: null,
          contract_completed_at: null,
          submissions: [],
        },
      ]);

      const result = await DashboardService.getUnitGroupTopDelayedProjects(
        staffUser,
        {
          unitId: 'unit-proc',
          procurementType: ProcurementType.LT100K,
          mode: 'month',
          dateFrom: new Date('2026-06-30T17:00:00.000Z'),
          dateTo: new Date('2026-07-31T16:59:59.999Z'),
        }
      );

      expect(result.projects[0]).toMatchObject({
        totalDays: 3,
        stageBreakdownDays: {
          assignmentDays: 1,
          procurementDays: 2,
          contractDays: 0,
          approvalDays: 0,
          financeDays: 0,
        },
      });
    });

    it('aggregates completed phase durations for all current unit staff', async () => {
      prismaMock.unit.findUnique.mockResolvedValue({ id: 'unit-proc' });
      prismaMock.user.findMany.mockResolvedValue([
        { id: 'staff-1', full_name: 'Ava' },
        { id: 'staff-2', full_name: 'Ben' },
        { id: 'staff-3', full_name: 'Chai' },
      ]);
      prismaMock.project.findMany.mockResolvedValue([
        {
          procurement_started_at: new Date('2026-06-30T17:00:00.000Z'),
          procurement_completed_at: new Date('2026-07-05T17:00:00.000Z'),
          contract_started_at: null,
          contract_completed_at: null,
          assignee_procurement: [{ id: 'staff-1' }, { id: 'staff-2' }],
          assignee_contract: [],
        },
        {
          procurement_started_at: null,
          procurement_completed_at: null,
          contract_started_at: new Date('2026-07-05T17:00:00.000Z'),
          contract_completed_at: new Date('2026-07-07T17:00:00.000Z'),
          assignee_procurement: [],
          assignee_contract: [{ id: 'staff-1' }],
        },
        {
          procurement_started_at: null,
          procurement_completed_at: new Date('2026-07-05T17:00:00.000Z'),
          contract_started_at: new Date('2026-07-01T17:00:00.000Z'),
          contract_completed_at: new Date('2026-08-01T17:00:00.000Z'),
          assignee_procurement: [{ id: 'staff-1' }],
          assignee_contract: [{ id: 'staff-1' }],
        },
      ]);
      prismaMock.holiday.findMany.mockResolvedValue([
        { date: new Date('2026-07-03T00:00:00.000Z') },
      ]);

      const result = await DashboardService.getUnitGroupStaffPerformance(
        staffUser,
        {
          unitId: 'unit-proc',
          mode: 'month',
          dateFrom: new Date('2026-06-30T17:00:00.000Z'),
          dateTo: new Date('2026-07-31T16:59:59.999Z'),
          page: 1,
          limit: 2,
        }
      );

      expect(result).toMatchObject({
        unitId: 'unit-proc',
        total: 3,
        page: 1,
        pageSize: 2,
        totalPages: 2,
        data: [
          {
            userId: 'staff-1',
            fullName: 'Ava',
            projectCount: 3,
            inProgressProjectCount: 1,
            completedProjectCount: 2,
            avgWorkingDurationDays: 2,
          },
          {
            userId: 'staff-2',
            fullName: 'Ben',
            projectCount: 1,
            inProgressProjectCount: 0,
            completedProjectCount: 1,
            avgWorkingDurationDays: 2,
          },
        ],
      });
      expect(prismaMock.holiday.findMany).toHaveBeenCalledTimes(1);
      const secondPage = await DashboardService.getUnitGroupStaffPerformance(
        staffUser,
        {
          unitId: 'unit-proc',
          mode: 'month',
          dateFrom: new Date('2026-06-30T17:00:00.000Z'),
          dateTo: new Date('2026-07-31T16:59:59.999Z'),
          page: 2,
          limit: 2,
        }
      );
      expect(secondPage.data).toEqual([
        {
          userId: 'staff-3',
          fullName: 'Chai',
          projectCount: 0,
          inProgressProjectCount: 0,
          completedProjectCount: 0,
          avgWorkingDurationDays: null,
        },
      ]);
      expect(prismaMock.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { not: ProjectStatus.CANCELLED },
            OR: [
              expect.objectContaining({
                procurement_started_at: { lte: expect.any(Date) },
                assignee_procurement: {
                  some: { id: { in: ['staff-1', 'staff-2', 'staff-3'] } },
                },
              }),
              expect.objectContaining({
                contract_started_at: { lte: expect.any(Date) },
                assignee_contract: {
                  some: { id: { in: ['staff-1', 'staff-2', 'staff-3'] } },
                },
              }),
            ],
          }),
        })
      );
      expect(prismaMock.projectHistory.findMany).not.toHaveBeenCalled();
      expect(prismaMock.projectInstallment.findMany).not.toHaveBeenCalled();
    });

    it('returns a not-found error when the selected unit does not exist', async () => {
      prismaMock.unit.findUnique.mockResolvedValue(null);

      await expect(
        DashboardService.getUnitGroupStaffPerformance(staffUser, {
          unitId: 'missing-unit',
          mode: 'month',
          dateFrom: new Date('2026-06-30T17:00:00.000Z'),
          dateTo: new Date('2026-07-31T16:59:59.999Z'),
          page: 1,
          limit: 50,
        })
      ).rejects.toThrowError('Unit not found');
      expect(prismaMock.user.findMany).not.toHaveBeenCalled();
    });

    it('rejects staff-performance access to a unit outside the caller scope', async () => {
      await expect(
        DashboardService.getUnitGroupStaffPerformance(externalUser, {
          unitId: 'unit-proc',
          mode: 'month',
          dateFrom: new Date('2026-06-30T17:00:00.000Z'),
          dateTo: new Date('2026-07-31T16:59:59.999Z'),
          page: 1,
          limit: 50,
        })
      ).rejects.toThrowError('You do not have access to this unit');
      expect(prismaMock.unit.findUnique).not.toHaveBeenCalled();
    });

    describe('getContractUnitSummary', () => {
      it('throws BadRequestError when the unit is not a contract unit', async () => {
        prismaMock.unit.findUnique.mockResolvedValue({
          id: 'unit-proc',
          dept_id: OPS_DEPT_ID,
          name: 'Procurement Unit',
          type: [UnitResponsibleType.LT100K],
        } as any);

        await expect(
          DashboardService.getContractUnitSummary(supplyUser, {
            unitId: 'unit-proc',
            mode: 'month',
            dateFrom: new Date('2026-06-30T17:00:00.000Z'),
            dateTo: new Date('2026-07-31T16:59:59.999Z'),
          })
        ).rejects.toThrowError('Unit is not a contract unit');
      });

      it('returns status breakdown and average contract duration for contract unit', async () => {
        prismaMock.unit.findUnique.mockResolvedValue({
          id: 'unit-contract',
          dept_id: OPS_DEPT_ID,
          name: 'Contract Unit',
          type: [UnitResponsibleType.CONTRACT],
        } as any);
        prismaMock.holiday.findMany.mockResolvedValue([]);

        prismaMock.project.groupBy.mockResolvedValueOnce([
          { status: ProjectStatus.UNASSIGNED, _count: { _all: 1 } },
          { status: ProjectStatus.WAITING_ACCEPT, _count: { _all: 1 } },
          { status: ProjectStatus.IN_PROGRESS, _count: { _all: 1 } },
          { status: ProjectStatus.WAITING_CLOSE, _count: { _all: 1 } },
          { status: ProjectStatus.CLOSED, _count: { _all: 2 } },
          { status: ProjectStatus.CANCELLED, _count: { _all: 1 } },
        ] as any);

        prismaMock.project.findMany.mockResolvedValueOnce([
          {
            contract_started_at: new Date('2026-07-01T00:00:00.000Z'),
            contract_completed_at: new Date('2026-07-06T00:00:00.000Z'),
          },
          {
            contract_started_at: new Date('2026-07-07T00:00:00.000Z'),
            contract_completed_at: null,
          },
        ] as any);

        const result = await DashboardService.getContractUnitSummary(
          supplyUser,
          {
            unitId: 'unit-contract',
            mode: 'month',
            dateFrom: new Date('2026-06-30T17:00:00.000Z'),
            dateTo: new Date('2026-07-31T16:59:59.999Z'),
          }
        );

        expect(result.unitId).toBe('unit-contract');
        expect(result.statusBreakdown).toEqual({
          unassigned: 1,
          waitingAccept: 1,
          inProgress: 2,
          completed: 2,
          cancelled: 1,
        });
        expect(result.phaseWorkload).toEqual({ inProgress: 1, completed: 1 });
        expect(result.avgContractDurationDays).toBeGreaterThanOrEqual(0);
        expect(prismaMock.project.groupBy).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              created_at: { gte: expect.any(Date), lte: expect.any(Date) },
            }),
          })
        );
        expect(prismaMock.project.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              created_at: { gte: expect.any(Date), lte: expect.any(Date) },
            }),
          })
        );
      });
    });

    describe('getIndividualStaffDashboard', () => {
      it('accepts an individual todo query without unitId', () => {
        expect(
          IndividualTodoQuerySchema.parse({ targetUserId: 'staff-1' })
        ).toEqual({
          targetUserId: 'staff-1',
          tab: 'all',
          page: 1,
          limit: 10,
        });
      });

      it("returns the selected user's project-own todo list", async () => {
        prismaMock.user.findUnique.mockResolvedValue({
          id: 'staff-1',
          username: 'staff',
          email: 'staff@example.com',
          full_name: 'Staff User',
          register_type: ['STANDARD'],
          roles: [
            {
              role: UserRole.GENERAL_STAFF,
              department: { id: OPS_DEPT_ID, name: 'Supply' },
              unit: { id: 'unit-proc', name: 'Procurement' },
            },
          ],
          delegations_received: [],
        } as any);
        prismaMock.unit.findMany.mockResolvedValue([
          {
            id: 'unit-proc',
            type: [UnitResponsibleType.LT100K],
          },
        ] as any);
        prismaMock.project.findMany.mockResolvedValue([
          { id: 'project-1', title: 'Target todo' },
        ] as any);
        prismaMock.project.count.mockResolvedValue(1);

        const result = await DashboardService.getIndividualStaffTodo({
          targetUserId: 'staff-1',
          tab: 'waiting_accept',
          page: 2,
          limit: 20,
        });

        expect(result).toMatchObject({
          total: 1,
          page: 2,
          pageSize: 20,
          totalPages: 1,
          data: [{ id: 'project-1', title: 'Target todo' }],
        });
        expect(prismaMock.project.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            skip: 20,
            take: 20,
            orderBy: [{ receive_no: 'desc' }],
          })
        );
        expect(prismaMock.project.count).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.any(Object),
          })
        );
      });

      it('throws NotFoundError when the todo target user does not exist', async () => {
        prismaMock.user.findUnique.mockResolvedValue(null);

        await expect(
          DashboardService.getIndividualStaffTodo({
            targetUserId: 'missing-user',
            tab: 'all',
            page: 1,
            limit: 10,
          })
        ).rejects.toThrowError('User not found');
        expect(prismaMock.project.findMany).not.toHaveBeenCalled();
      });

      it('returns total counts by tab for individual staff todos', async () => {
        prismaMock.user.findUnique.mockResolvedValue({
          id: 'staff-1',
          username: 'staff',
          email: 'staff@example.com',
          full_name: 'Staff User',
          register_type: ['STANDARD'],
          roles: [
            {
              role: UserRole.GENERAL_STAFF,
              department: { id: OPS_DEPT_ID, name: 'Supply' },
              unit: { id: 'unit-proc', name: 'Procurement' },
            },
          ],
          delegations_received: [],
        } as any);
        prismaMock.unit.findMany.mockResolvedValue([
          {
            id: 'unit-proc',
            type: [UnitResponsibleType.LT100K],
          },
        ] as any);
        prismaMock.project.count.mockResolvedValue(5);

        const totals = await DashboardService.getIndividualStaffTodoTotal({
          targetUserId: 'staff-1',
        });

        expect(totals).toBeDefined();
        expect(totals.all).toBe(5);
      });

      it('throws NotFoundError when staff user is not in the unit', async () => {
        prismaMock.unit.findUnique.mockResolvedValue({
          id: 'unit-proc',
        } as any);
        prismaMock.user.findFirst.mockResolvedValue(null);

        await expect(
          DashboardService.getIndividualStaffDashboard(supplyUser, {
            unitId: 'unit-proc',
            targetUserId: 'nonexistent-user',
          })
        ).rejects.toThrowError('Staff user not found in this unit');
      });

      it('returns individual staff dashboard with duration comparison and procurement method metrics', async () => {
        prismaMock.unit.findUnique.mockResolvedValue({
          id: 'unit-proc',
          type: [UnitResponsibleType.LT100K, UnitResponsibleType.LT500K],
        } as any);
        prismaMock.user.findFirst.mockResolvedValue({
          id: 'staff-1',
          full_name: 'Somchai Jaidee',
        } as any);
        prismaMock.holiday.findMany.mockResolvedValue([]);

        prismaMock.project.findMany
          .mockResolvedValueOnce([
            { procurement_type: ProcurementType.LT100K },
            { procurement_type: ProcurementType.LT100K },
            { procurement_type: ProcurementType.LT500K },
          ] as any)
          .mockResolvedValueOnce([
            {
              procurement_type: ProcurementType.LT100K,
              procurement_started_at: new Date('2026-07-01T00:00:00.000Z'),
              procurement_completed_at: new Date('2026-07-11T00:00:00.000Z'),
              contract_started_at: null,
              contract_completed_at: null,
              assignee_procurement: [{ id: 'staff-1' }],
              assignee_contract: [],
            },
            {
              procurement_type: ProcurementType.LT100K,
              procurement_started_at: new Date('2026-07-01T00:00:00.000Z'),
              procurement_completed_at: new Date('2026-07-08T00:00:00.000Z'),
              contract_started_at: null,
              contract_completed_at: null,
              assignee_procurement: [{ id: 'staff-2' }],
              assignee_contract: [],
            },
          ] as any);

        const result = await DashboardService.getIndividualStaffDashboard(
          supplyUser,
          {
            unitId: 'unit-proc',
            targetUserId: 'staff-1',
          }
        );

        expect(result.unitId).toBe('unit-proc');
        expect(result.user).toEqual({
          id: 'staff-1',
          fullName: 'Somchai Jaidee',
        });
        expect(result.procurementMethodMetrics?.total).toBe(3);
        expect(result.procurementMethodMetrics?.byProcurementType).toEqual([
          { type: ProcurementType.LT100K, count: 2 },
          { type: ProcurementType.LT500K, count: 1 },
        ]);
        expect(result.durationComparison.length).toBeGreaterThan(0);
        expect(result.durationComparison[0].workflowType).toBeDefined();
      });
    });
  });
});
