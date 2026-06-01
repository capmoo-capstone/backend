import { UserRole } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    txMock.userDelegation.findFirst.mockResolvedValue(null);
    txMock.userDelegation.create.mockResolvedValue({
      id: 'delegation-1',
      delegator_id: 'delegator-1',
      delegatee_id: 'delegatee-1',
      is_active: true,
    });

    const result = await addDelegation(user, {
      delegator_id: 'delegator-1',
      delegatee_id: 'delegatee-1',
      start_date: new Date('2026-06-01T00:00:00.000Z'),
    } as any);

    expect(result.id).toBe('delegation-1');
    expect(mockedGetUserById).toHaveBeenCalledTimes(2);
    expect(txMock.user.update).toHaveBeenCalledWith({
      where: { id: 'delegatee-1' },
      data: { role_updated_at: new Date('2026-06-01T00:00:00.000Z') },
    });
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
      delegator: { id: 'delegator-1', full_name: 'Delegator', roles: [] },
      delegatee: { id: 'delegatee-1', full_name: 'Delegatee', roles: [] },
    });

    const result = await getById('delegation-1');

    expect(result.delegator.full_name).toBe('Delegator');
  });

  it('getActiveDelegation returns the active delegation for a head-of-unit role', async () => {
    prismaMock.userDelegation.findFirst.mockResolvedValue({
      id: 'delegation-1',
      delegator: {
        id: 'delegator-1',
        full_name: 'Delegator',
        roles: [{ role: UserRole.HEAD_OF_UNIT, unit_id: 'unit-1' }],
      },
      delegatee: { id: 'delegatee-1', full_name: 'Delegatee', roles: [] },
    });

    const result = await getActiveDelegation(UserRole.HEAD_OF_UNIT, 'unit-1');

    expect(result?.id).toBe('delegation-1');
    expect(
      prismaMock.userDelegation.findFirst.mock.calls[0][0].where
    ).toMatchObject({
      delegator: {
        roles: {
          some: {
            role: UserRole.HEAD_OF_UNIT,
            unit_id: 'unit-1',
          },
        },
      },
      is_active: true,
    });
  });
});
