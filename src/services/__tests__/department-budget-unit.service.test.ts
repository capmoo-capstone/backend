import { UnitResponsibleType, UserRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { OPS_DEPT_ID } from '../../lib/constant';
import { prismaMock, txMock } from '../../test/prisma-mock';
import {
  createDepartment,
  getById as getDepartmentById,
  listDepartments,
  updateDepartment,
} from '../department.service';
import {
  deleteBudgetPlan,
  importBudgetPlan,
  listBudgetPlans,
  updateProjectIdPlan,
} from '../budget-plan.service';
import {
  createUnit,
  getRepresentative,
  listUnits,
  updateRepresentative,
  updateUnit,
  updateUnitUsers,
} from '../unit.service';

const user = { id: 'user-1', roles: [] } as any;

describe('department.service', () => {
  it('listDepartments returns all departments with units included', async () => {
    prismaMock.department.findMany.mockResolvedValue([
      {
        id: 'dept-1',
        name: 'Dept One',
        units: [
          {
            id: 'unit-1',
            dept_id: 'dept-1',
            name: 'Unit One',
            type: [UnitResponsibleType.LT100K],
            organization_roles: [
              { user: { id: 'rep-1', full_name: 'Rep One' } },
            ],
          },
        ],
      },
    ]);
    prismaMock.department.count.mockResolvedValue(1);

    const result = await listDepartments(user, { withUnit: true });

    expect(result.total).toBe(1);
    expect(result.data[0].units?.[0].rep).toEqual({
      id: 'rep-1',
      full_name: 'Rep One',
    });
  });

  it('getById returns a department with units', async () => {
    prismaMock.department.findUnique.mockResolvedValue({
      id: 'dept-1',
      name: 'Dept One',
      units: [{ id: 'unit-1', name: 'Unit One' }],
    });

    const result = await getDepartmentById('dept-1');

    expect(result.id).toBe('dept-1');
  });

  it('createDepartment creates a new department', async () => {
    prismaMock.department.create.mockResolvedValue({
      id: 'dept-1',
      name: 'Dept One',
    });

    const result = await createDepartment({ id: 'dept-1', name: 'Dept One' });

    expect(result.name).toBe('Dept One');
    expect(prismaMock.department.create).toHaveBeenCalledWith({
      data: { id: 'dept-1', name: 'Dept One' },
    });
  });

  it('updateDepartment updates department name', async () => {
    prismaMock.department.findUnique.mockResolvedValue({
      id: 'dept-1',
      name: 'Old Dept',
      units: [],
    });
    prismaMock.department.update.mockResolvedValue({
      id: 'dept-1',
      name: 'New Dept',
    });

    const result = await updateDepartment({ id: 'dept-1', name: 'New Dept' });

    expect(result.name).toBe('New Dept');
  });
});

describe('budget-plan.service', () => {
  it('listBudgetPlans returns paginated plans filtered by unitId', async () => {
    prismaMock.budgetPlan.findMany.mockResolvedValue([
      {
        id: 'budget-1',
        budget_name: 'Budget One',
        unit: { name: 'Unit One', department: { name: 'Dept One' } },
      },
    ]);
    prismaMock.budgetPlan.count.mockResolvedValue(1);

    const result = await listBudgetPlans(
      user,
      1,
      10,
      undefined,
      'unit-1',
      true
    );

    expect(result).toMatchObject({
      total: 1,
      page: 1,
      data: [{ id: 'budget-1', unit_name: 'Unit One', dept_name: 'Dept One' }],
    });
    expect(prismaMock.budgetPlan.findMany.mock.calls[0][0].where).toEqual({
      unit_id: 'unit-1',
      project_id: null,
    });
  });

  it('importBudgetPlan bulk creates plans and returns count', async () => {
    prismaMock.budgetPlan.createManyAndReturn.mockResolvedValue([
      { id: 'budget-1', budget_name: 'Budget One' },
    ]);

    const result = await importBudgetPlan(user, [
      { budget_name: 'Budget One', budget_amount: 1000 },
    ] as any);

    expect(result.total).toBe(1);
    expect(
      prismaMock.budgetPlan.createManyAndReturn.mock.calls[0][0].data[0]
    ).toMatchObject({
      created_by: user.id,
    });
  });

  it('updateProjectIdPlan links a budget plan to a project', async () => {
    prismaMock.budgetPlan.update.mockResolvedValue({
      id: 'budget-1',
      project_id: 'project-1',
    });

    const result = await updateProjectIdPlan(user, 'budget-1', 'project-1');

    expect(result.project_id).toBe('project-1');
  });

  it('deleteBudgetPlan deletes a budget plan by id', async () => {
    prismaMock.budgetPlan.delete.mockResolvedValue({ id: 'budget-1' });

    await deleteBudgetPlan(user, 'budget-1');

    expect(prismaMock.budgetPlan.delete).toHaveBeenCalledWith({
      where: { id: 'budget-1' },
    });
  });
});

describe('unit.service', () => {
  it('listUnits returns paginated units with no options', async () => {
    prismaMock.unit.findMany.mockResolvedValue([
      { id: 'unit-1', name: 'Unit One', dept_id: 'dept-1', type: [] },
    ]);
    prismaMock.unit.count.mockResolvedValue(1);

    const result = await listUnits(1, 10);

    expect(result.total).toBe(1);
    expect(result.data[0].id).toBe('unit-1');
  });

  it('listUnits returns only delegations matching the head-of-unit scope', async () => {
    prismaMock.unit.findMany.mockResolvedValue([
      {
        id: 'unit-1',
        name: 'Unit One',
        dept_id: OPS_DEPT_ID,
        type: [],
        organization_roles: [
          {
            role: UserRole.HEAD_OF_UNIT,
            user: {
              id: 'head-1',
              full_name: 'Head One',
              delegations_given: [
                {
                  id: 'other-unit-delegation',
                  role: UserRole.HEAD_OF_UNIT,
                  unit_id: 'unit-2',
                  start_date: new Date('2026-06-01T00:00:00.000Z'),
                  end_date: null,
                  delegator: { id: 'head-1', full_name: 'Head One' },
                  delegatee: {
                    id: 'delegatee-2',
                    full_name: 'Delegatee Two',
                  },
                },
                {
                  id: 'matching-delegation',
                  role: UserRole.HEAD_OF_UNIT,
                  unit_id: 'unit-1',
                  start_date: new Date('2026-06-01T00:00:00.000Z'),
                  end_date: null,
                  delegator: { id: 'head-1', full_name: 'Head One' },
                  delegatee: {
                    id: 'delegatee-1',
                    full_name: 'Delegatee One',
                  },
                },
              ],
            },
          },
        ],
      },
    ]);
    prismaMock.unit.count.mockResolvedValue(1);

    const result = await listUnits(1, 10, { withDelegations: true });

    expect(result.data[0].delegations).toEqual([
      expect.objectContaining({
        id: 'matching-delegation',
        role: UserRole.HEAD_OF_UNIT,
        unit_id: 'unit-1',
      }),
    ]);
  });

  it('createUnit creates a unit with a unique type', async () => {
    prismaMock.unit.findFirst.mockResolvedValue(null);
    prismaMock.unit.create.mockResolvedValue({
      id: 'unit-1',
      name: 'Unit One',
      type: [UnitResponsibleType.LT100K],
    });

    const result = await createUnit({
      id: 'unit-1',
      name: 'Unit One',
      dept_id: OPS_DEPT_ID,
      type: [UnitResponsibleType.LT100K],
    });

    expect(result.id).toBe('unit-1');
  });

  it('updateUnit updates unit name', async () => {
    prismaMock.unit.findUnique.mockResolvedValue({
      id: 'unit-1',
      name: 'Old Unit',
    });
    prismaMock.unit.findFirst.mockResolvedValue(null);
    prismaMock.unit.update.mockResolvedValue({
      id: 'unit-1',
      name: 'New Unit',
    });

    const result = await updateUnit({ id: 'unit-1', name: 'New Unit' } as any);

    expect(result.name).toBe('New Unit');
  });

  it('getRepresentative returns the representative user for a unit', async () => {
    prismaMock.unit.findUnique.mockResolvedValue({ id: 'unit-1' });
    prismaMock.userOrganizationRole.findFirst.mockResolvedValue({
      user: { id: 'rep-1', full_name: 'Rep One' },
    });

    const result = await getRepresentative('unit-1');

    expect(result).toEqual({
      id: 'rep-1',
      full_name: 'Rep One',
      unit_id: 'unit-1',
    });
  });

  it('updateUnitUsers adds general staff users to a supply unit', async () => {
    txMock.unit.findUnique.mockResolvedValue({
      id: 'unit-1',
      dept_id: OPS_DEPT_ID,
    });
    txMock.user.count.mockResolvedValue(1);
    txMock.userOrganizationRole.findFirst
      .mockResolvedValueOnce({ id: 'ops-role' })
      .mockResolvedValueOnce(null);
    txMock.userOrganizationRole.findMany.mockResolvedValue([]);
    txMock.userOrganizationRole.create.mockResolvedValue({
      id: 'role-1',
      role: UserRole.GENERAL_STAFF,
    });

    const result = await updateUnitUsers({
      unit_id: 'unit-1',
      new_users: ['user-1'],
      remove_users: [],
    });

    expect(result).toEqual({ added: 1, removed: 0 });
    expect(txMock.userOrganizationRole.create).toHaveBeenCalledWith({
      data: {
        user_id: 'user-1',
        role: UserRole.GENERAL_STAFF,
        dept_id: OPS_DEPT_ID,
        unit_id: 'unit-1',
      },
    });
  });

  it('updateRepresentative sets a representative for a non-supply unit', async () => {
    txMock.unit.findUnique.mockResolvedValue({
      id: 'unit-1',
      department: { id: 'dept-1' },
    });
    txMock.user.count.mockResolvedValue(1);
    txMock.userOrganizationRole.findFirst.mockResolvedValue(null);
    txMock.userOrganizationRole.findMany.mockResolvedValue([]);
    txMock.userOrganizationRole.create.mockResolvedValue({
      id: 'role-1',
      role: UserRole.REPRESENTATIVE,
    });

    const result = await updateRepresentative({
      unit_id: 'unit-1',
      new_users: ['rep-1'],
      remove_users: [],
    });

    expect(result).toEqual({ added: 1, removed: 0 });
    expect(txMock.userOrganizationRole.create).toHaveBeenCalledWith({
      data: {
        user_id: 'rep-1',
        role: UserRole.REPRESENTATIVE,
        dept_id: 'dept-1',
        unit_id: 'unit-1',
      },
    });
  });
});
