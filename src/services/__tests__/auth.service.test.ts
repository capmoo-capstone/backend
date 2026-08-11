import { UserRole, RegisterType } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearUserAuthCache } from '../../lib/auth-cache';
import { OPS_DEPT_ID } from '../../lib/constant';
import { prismaMock } from '../../test/prisma-mock';
import {
  clearSessionCache,
  exchangeSsoCode,
  login,
  loginWithSamlClaims,
} from '../auth.service';

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
      .mockResolvedValueOnce({
        id: 'user-1',
        password: 'hashed-password',
        register_type: RegisterType.STANDARD,
      })
      .mockResolvedValueOnce({
        id: 'user-1',
        username: 'staff',
        full_name: 'Staff User',
        register_type: RegisterType.STANDARD,
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
      username: 'staff',
      full_name: 'Staff User',
      roles: [
        {
          role: UserRole.GENERAL_STAFF,
          dept_id: 'dept-1',
          unit_id: 'unit-1',
        },
      ],
    });
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { last_login_at: expect.any(Date) },
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
      .mockResolvedValueOnce({
        id: 'delegatee-1',
        password: 'hashed-password',
        register_type: RegisterType.STANDARD,
      })
      .mockResolvedValueOnce({
        id: 'delegatee-1',
        username: 'delegatee',
        full_name: 'Delegatee User',
        register_type: RegisterType.STANDARD,
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

  it('uses an existing user for SAML and returns an SSO exchange code', async () => {
    prismaMock.user.findUnique
      .mockResolvedValueOnce({
        id: 'user-1',
        email: 'staff@chula.ac.th',
        register_type: RegisterType.SSO,
      })
      .mockResolvedValueOnce({
        id: 'user-1',
        username: 'portal.staff',
        full_name: 'Portal Staff',
        register_type: RegisterType.SSO,
        roles: [
          {
            role: UserRole.GENERAL_STAFF,
            department: { id: 'dept-1', name: 'Dept One' },
            unit: { id: 'unit-1', name: 'Unit One' },
          },
        ],
        delegations_received: [],
      });
    prismaMock.samlRequestCache.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.samlRequestCache.upsert.mockResolvedValue({});
    mockedJwt.sign.mockReturnValue('saml-token' as any);

    const result = await loginWithSamlClaims({
      screenName: 'portal.staff',
      emailAddress: 'staff@chula.ac.th',
      firstName: 'Portal',
      lastName: 'Staff',
    });

    expect(typeof result).toBe('string');
    expect(result).toHaveLength(32);
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { last_login_at: expect.any(Date) },
    });
  });

  it('exchanges SSO code for user authorization details and JWT token', async () => {
    const mockAuthPayload = {
      token: 'saml-token',
      id: 'user-1',
      username: 'portal.staff',
      full_name: 'Portal Staff',
      roles: [
        {
          role: UserRole.GENERAL_STAFF,
          dept_id: 'dept-1',
          dept_name: 'Dept One',
          unit_id: 'unit-1',
          unit_name: 'Unit One',
        },
      ],
      is_delegated: false,
      delegated_by: [],
    };

    prismaMock.samlRequestCache.findUnique.mockResolvedValueOnce({
      key: 'sso_code:test-code-123',
      value: JSON.stringify(mockAuthPayload),
      expires_at: new Date(Date.now() + 60000),
    });
    prismaMock.samlRequestCache.deleteMany.mockResolvedValue({ count: 1 });

    const result = await exchangeSsoCode('test-code-123');

    expect(result).toEqual(mockAuthPayload);
  });

  it('rejects an SSO user that does not already exist', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(
      loginWithSamlClaims({
        screenName: 'unknown.user',
        emailAddress: 'unknown@chula.ac.th',
        firstName: 'Unknown',
        lastName: 'User',
      })
    ).rejects.toThrow('No system account is assigned');

    expect(prismaMock.user.create).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('rejects a password login for an SSO account', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      password: null,
      register_type: RegisterType.SSO,
    });

    await expect(login('portal.staff', 'password')).rejects.toThrow(
      'Cannot login with username and password, please login with CU Account'
    );

    expect(mockedBcrypt.compareSync).not.toHaveBeenCalled();
  });

  it('rejects an SSO claim whose email does not match the approved account', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'approved@chula.ac.th',
      register_type: RegisterType.SSO,
    });

    await expect(
      loginWithSamlClaims({
        screenName: 'portal.staff',
        emailAddress: 'different@chula.ac.th',
        firstName: 'Portal',
        lastName: 'Staff',
      })
    ).rejects.toThrow('No system account is assigned');
  });

  it('rejects SAML authentication for a standard account', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'staff@chula.ac.th',
      register_type: RegisterType.STANDARD,
    });

    await expect(
      loginWithSamlClaims({
        screenName: 'portal.staff',
        emailAddress: 'staff@chula.ac.th',
        firstName: 'Portal',
        lastName: 'Staff',
      })
    ).rejects.toThrow('No system account is assigned');
  });

  it('clearSessionCache clears the auth cache for the current user', async () => {
    await clearSessionCache({ id: 'user-1' } as any);

    expect(mockedClearUserAuthCache).toHaveBeenCalledWith('user-1');
  });
});
