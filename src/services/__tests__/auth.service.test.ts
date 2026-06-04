import { UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearUserAuthCache } from '../../lib/auth-cache';
import { OPS_DEPT_ID } from '../../lib/constant';
import { prismaMock, txMock } from '../../test/prisma-mock';
import { clearSessionCache, login, register } from '../auth.service';

vi.mock('bcrypt', () => ({
  default: {
    compareSync: vi.fn(),
    hash: vi.fn(),
  },
  compareSync: vi.fn(),
  hash: vi.fn(),
}));

vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn(),
  },
  sign: vi.fn(),
}));

vi.mock('../../lib/auth-cache', () => ({
  clearUserAuthCache: vi.fn(),
}));

const mockedBcrypt = vi.mocked(bcrypt);
const mockedJwt = vi.mocked(jwt);
const mockedClearUserAuthCache = vi.mocked(clearUserAuthCache);

describe('auth.service', () => {
  beforeEach(() => {
    mockedBcrypt.compareSync.mockReset();
    mockedBcrypt.hash.mockReset();
    mockedJwt.sign.mockReset();
    mockedClearUserAuthCache.mockReset();
  });

  it('login returns a token and formatted roles when credentials are valid', async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ id: 'user-1', password: 'hashed-password' })
      .mockResolvedValueOnce({
        id: 'user-1',
        username: 'staff',
        full_name: 'Staff User',
        roles: [
          {
            role: UserRole.GENERAL_STAFF,
            department: { id: 'dept-1', name: 'Dept One' },
            unit: { id: 'unit-1', name: 'Unit One' },
          },
        ],
        delegations_received: [],
      });
    mockedBcrypt.compareSync.mockReturnValue(true);
    mockedJwt.sign.mockReturnValue('signed-token' as any);

    const result = await login('staff', 'password');

    expect(result).toMatchObject({
      token: 'signed-token',
      id: 'user-1',
      roles: [
        {
          role: UserRole.GENERAL_STAFF,
          dept_id: 'dept-1',
          unit_id: 'unit-1',
        },
      ],
    });
    expect(mockedJwt.sign).toHaveBeenCalledWith(
      {
        id: 'user-1',
        username: 'staff',
        full_name: 'Staff User',
      },
      process.env.JWT_SECRET,
      { expiresIn: '3h' }
    );
  });

  it('login inherits only the role scope selected by an active delegation', async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce({ id: 'delegatee-1', password: 'hashed-password' })
      .mockResolvedValueOnce({
        id: 'delegatee-1',
        username: 'delegatee',
        full_name: 'Delegatee User',
        roles: [
          {
            role: UserRole.GENERAL_STAFF,
            dept_id: 'dept-1',
            unit_id: 'unit-1',
            department: { id: 'dept-1', name: 'Dept One' },
            unit: { id: 'unit-1', name: 'Unit One' },
          },
        ],
        delegations_received: [
          {
            id: 'delegation-1',
            role: UserRole.HEAD_OF_UNIT,
            unit_id: 'unit-1',
            start_date: new Date('2026-06-01T00:00:00.000Z'),
            end_date: null,
            delegator: {
              id: 'delegator-1',
              full_name: 'Delegator User',
              roles: [
                {
                  role: UserRole.HEAD_OF_UNIT,
                  dept_id: OPS_DEPT_ID,
                  unit_id: 'unit-1',
                  department: { id: OPS_DEPT_ID, name: 'Supply Operation' },
                  unit: { id: 'unit-1', name: 'Unit One' },
                },
              ],
            },
          },
        ],
      });
    mockedBcrypt.compareSync.mockReturnValue(true);
    mockedJwt.sign.mockReturnValue('signed-token' as any);

    const result = await login('delegatee', 'password');

    expect(result.roles).toEqual([
      expect.objectContaining({
        role: UserRole.GENERAL_STAFF,
        dept_id: 'dept-1',
        unit_id: 'unit-1',
      }),
      expect.objectContaining({
        role: UserRole.HEAD_OF_UNIT,
        dept_id: OPS_DEPT_ID,
        unit_id: 'unit-1',
      }),
    ]);
    expect(result.roles).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: UserRole.ADMIN }),
      ])
    );
    expect(result.delegated_by).toEqual([
      {
        id: 'delegator-1',
        full_name: 'Delegator User',
        role: UserRole.HEAD_OF_UNIT,
        dept_id: OPS_DEPT_ID,
        unit_id: 'unit-1',
        start_date: new Date('2026-06-01T00:00:00.000Z'),
        end_date: null,
      },
    ]);
  });

  it('register creates a department-level role without a unit', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    txMock.department.findUnique.mockResolvedValue({
      id: 'dept-1',
      units: [{ id: 'unit-1' }],
    });
    mockedBcrypt.hash.mockResolvedValue('hashed-password' as never);
    txMock.user.create.mockResolvedValue({
      id: 'user-1',
      username: 'dept-head',
      roles: [{ role: UserRole.HEAD_OF_DEPARTMENT }],
    });

    const result = await register({
      username: 'dept-head',
      password: 'password',
      full_name: 'Dept Head',
      email: 'head@example.test',
      role: UserRole.HEAD_OF_DEPARTMENT,
      dept_id: 'dept-1',
    } as any);

    expect(result.id).toBe('user-1');
    expect(txMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          password: 'hashed-password',
          roles: {
            create: [
              {
                role: UserRole.HEAD_OF_DEPARTMENT,
                dept_id: 'dept-1',
                unit_id: null,
              },
            ],
          },
        }),
      })
    );
  });

  it('register creates a unit-level role when the unit belongs to the department', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    txMock.department.findUnique.mockResolvedValue({
      id: 'dept-1',
      units: [{ id: 'unit-1' }],
    });
    mockedBcrypt.hash.mockResolvedValue('hashed-password' as never);
    txMock.user.create.mockResolvedValue({
      id: 'user-2',
      username: 'unit-head',
      roles: [{ role: UserRole.HEAD_OF_UNIT }],
    });

    const result = await register({
      username: 'unit-head',
      password: 'password',
      full_name: 'Unit Head',
      email: 'unit-head@example.test',
      role: UserRole.HEAD_OF_UNIT,
      dept_id: 'dept-1',
      unit_id: 'unit-1',
    } as any);

    expect(result.id).toBe('user-2');
    expect(
      txMock.user.create.mock.calls[0][0].data.roles.create[0]
    ).toMatchObject({
      role: UserRole.HEAD_OF_UNIT,
      unit_id: 'unit-1',
    });
  });

  it('clearSessionCache clears the auth cache for the current user', async () => {
    await clearSessionCache({ id: 'user-1' } as any);

    expect(mockedClearUserAuthCache).toHaveBeenCalledWith('user-1');
  });
});
