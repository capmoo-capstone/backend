import { UserRole } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OPS_DEPT_ID } from '../../lib/constant';
import { txMock, prismaMock } from '../../test/prisma-mock';
import { getById as getUserById } from '../user.service';
import {
  addDelegation,
  cancelDelegation,
  getActiveDelegation,
  getById,
} from '../delegation.service';

vi.mock('../user.service', () => ({
  getById: vi.fn().mockResolvedValue({ id: 'user-1' }),
}));

const mockedGetUserById = vi.mocked(getUserById);
const user = { id: 'creator-1', roles: [] } as any;

describe('delegation.service', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-06-01T00:00:00.000Z'));
    mockedGetUserById.mockReset();
    mockedGetUserById.mockResolvedValue({ id: 'user-1' } as any);
  });

  it('addDelegation creates a delegation and updates role_updated_at', async () => {
    txMock.userOrganizationRole.findFirst.mockResolvedValue({ id: 'role-1' });
    txMock.userDelegation.findFirst.mockResolvedValue(null);
    txMock.userDelegation.create.mockResolvedValue({
      id: 'delegation-1',
      delegator_id: 'delegator-1',
      delegatee_id: 'delegatee-1',
      role: UserRole.HEAD_OF_UNIT,
      unit_id: 'unit-1',
      is_active: true,
    });

    const result = await addDelegation(user, {
      delegator_id: 'delegator-1',
      delegatee_id: 'delegatee-1',
      role: UserRole.HEAD_OF_UNIT,
      unit_id: 'unit-1',
      start_date: new Date('2026-06-01T00:00:00.000Z'),
    } as any);

    expect(result.id).toBe('delegation-1');
    expect(mockedGetUserById).toHaveBeenCalledTimes(2);
    expect(txMock.userOrganizationRole.findFirst).toHaveBeenCalledWith({
      where: {
        user_id: 'delegator-1',
        role: UserRole.HEAD_OF_UNIT,
        dept_id: OPS_DEPT_ID,
        unit_id: 'unit-1',
      },
      select: { id: true },
    });
    expect(txMock.userDelegation.findFirst).toHaveBeenCalledWith({
      where: {
        delegator_id: 'delegator-1',
        role: UserRole.HEAD_OF_UNIT,
        unit_id: 'unit-1',
        is_active: true,
        OR: [
          { end_date: { equals: null } },
          { end_date: { gte: new Date('2026-06-01T00:00:00.000Z') } },
        ],
      },
    });
    expect(txMock.userDelegation.create).toHaveBeenCalledWith({
      data: {
        delegator_id: 'delegator-1',
        delegatee_id: 'delegatee-1',
        role: UserRole.HEAD_OF_UNIT,
        unit_id: 'unit-1',
        start_date: new Date('2026-06-01T00:00:00.000Z'),
        end_date: undefined,
        is_active: true,
        created_by: user.id,
      },
    });
    expect(txMock.user.update).toHaveBeenCalledWith({
      where: { id: 'delegatee-1' },
      data: { role_updated_at: new Date('2026-06-01T00:00:00.000Z') },
    });
  });

  it('addDelegation allows another active delegation for a different role scope', async () => {
    txMock.userOrganizationRole.findFirst.mockResolvedValue({ id: 'role-1' });
    txMock.userDelegation.findFirst.mockResolvedValue(null);
    txMock.userDelegation.create.mockResolvedValue({
      id: 'delegation-2',
      role: UserRole.HEAD_OF_DEPARTMENT,
      unit_id: null,
    });

    const result = await addDelegation(user, {
      delegator_id: 'delegator-1',
      delegatee_id: 'delegatee-2',
      role: UserRole.HEAD_OF_DEPARTMENT,
      start_date: new Date('2026-06-01T00:00:00.000Z'),
    } as any);

    expect(result.id).toBe('delegation-2');
    expect(
      txMock.userDelegation.findFirst.mock.calls[0][0].where
    ).toMatchObject({
      delegator_id: 'delegator-1',
      role: UserRole.HEAD_OF_DEPARTMENT,
      unit_id: null,
    });
  });

  it('addDelegation rejects a duplicate active delegation for the same role scope', async () => {
    txMock.userOrganizationRole.findFirst.mockResolvedValue({ id: 'role-1' });
    txMock.userDelegation.findFirst.mockResolvedValue({
      id: 'existing-delegation',
    });

    await expect(
      addDelegation(user, {
        delegator_id: 'delegator-1',
        delegatee_id: 'delegatee-1',
        role: UserRole.HEAD_OF_UNIT,
        unit_id: 'unit-1',
        start_date: new Date('2026-06-01T00:00:00.000Z'),
      } as any)
    ).rejects.toThrow('An active delegation already exists');

    expect(txMock.userDelegation.create).not.toHaveBeenCalled();
  });

  it('addDelegation rejects a role scope the delegator does not own', async () => {
    txMock.userOrganizationRole.findFirst.mockResolvedValue(null);

    await expect(
      addDelegation(user, {
        delegator_id: 'delegator-1',
        delegatee_id: 'delegatee-1',
        role: UserRole.HEAD_OF_UNIT,
        unit_id: 'unit-1',
        start_date: new Date('2026-06-01T00:00:00.000Z'),
      } as any)
    ).rejects.toThrow('Delegator does not have the specified role scope');

    expect(txMock.userDelegation.create).not.toHaveBeenCalled();
  });

  it('addDelegation rejects invalid role scope shapes', async () => {
    await expect(
      addDelegation(user, {
        delegator_id: 'delegator-1',
        delegatee_id: 'delegatee-1',
        role: UserRole.HEAD_OF_UNIT,
        start_date: new Date('2026-06-01T00:00:00.000Z'),
      } as any)
    ).rejects.toThrow('unit_id is required');

    await expect(
      addDelegation(user, {
        delegator_id: 'delegator-1',
        delegatee_id: 'delegatee-1',
        role: UserRole.HEAD_OF_DEPARTMENT,
        unit_id: 'unit-1',
        start_date: new Date('2026-06-01T00:00:00.000Z'),
      } as any)
    ).rejects.toThrow('unit_id is not allowed');
  });

  it('cancelDelegation sets is_active=false and records cancellation metadata', async () => {
    txMock.userDelegation.findUnique.mockResolvedValue({
      id: 'delegation-1',
      delegatee_id: 'delegatee-1',
    });
    txMock.userDelegation.update.mockResolvedValue({
      id: 'delegation-1',
      delegatee_id: 'delegatee-1',
      is_active: false,
    });

    const result = await cancelDelegation(user, 'delegation-1');

    expect(result.is_active).toBe(false);
    expect(txMock.userDelegation.update).toHaveBeenCalledWith({
      where: { id: 'delegation-1' },
      data: {
        is_active: false,
        cancelled_at: new Date('2026-06-01T00:00:00.000Z'),
        cancelled_by: user.id,
      },
    });
  });

  it('getById returns delegation with delegator and delegatee details', async () => {
    prismaMock.userDelegation.findUnique.mockResolvedValue({
      id: 'delegation-1',
      role: UserRole.HEAD_OF_UNIT,
      unit_id: 'unit-1',
      delegator: {
        id: 'delegator-1',
        full_name: 'Delegator',
        roles: [
          {
            role: UserRole.HEAD_OF_UNIT,
            dept_id: OPS_DEPT_ID,
            unit_id: 'unit-1',
          },
          {
            role: UserRole.ADMIN,
            dept_id: OPS_DEPT_ID,
            unit_id: null,
          },
        ],
      },
      delegatee: { id: 'delegatee-1', full_name: 'Delegatee', roles: [] },
    });

    const result = await getById('delegation-1');

    expect(result.delegator.full_name).toBe('Delegator');
    expect(result.delegator.roles).toEqual([
      {
        role: UserRole.HEAD_OF_UNIT,
        dept_id: OPS_DEPT_ID,
        unit_id: 'unit-1',
      },
    ]);
  });

  it('getActiveDelegation returns the active delegation for a head-of-unit role', async () => {
    prismaMock.userDelegation.findFirst.mockResolvedValue({
      id: 'delegation-1',
      role: UserRole.HEAD_OF_UNIT,
      unit_id: 'unit-1',
      delegator: {
        id: 'delegator-1',
        full_name: 'Delegator',
        roles: [
          {
            role: UserRole.HEAD_OF_UNIT,
            dept_id: OPS_DEPT_ID,
            unit_id: 'unit-1',
          },
          {
            role: UserRole.ADMIN,
            dept_id: OPS_DEPT_ID,
            unit_id: null,
          },
        ],
      },
      delegatee: { id: 'delegatee-1', full_name: 'Delegatee', roles: [] },
    });

    const result = await getActiveDelegation(UserRole.HEAD_OF_UNIT, 'unit-1');

    expect(result?.id).toBe('delegation-1');
    expect(
      prismaMock.userDelegation.findFirst.mock.calls[0][0].where
    ).toMatchObject({
      role: UserRole.HEAD_OF_UNIT,
      unit_id: 'unit-1',
      is_active: true,
    });
    expect(result?.delegator.roles).toEqual([
      {
        role: UserRole.HEAD_OF_UNIT,
        dept_id: OPS_DEPT_ID,
        unit_id: 'unit-1',
      },
    ]);
  });
});
