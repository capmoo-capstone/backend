import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role } from '@prisma/client';
import { BadRequestError, NotFoundError } from '../lib/errors';
import * as rolesLib from '../lib/roles';
import { prisma } from '../config/prisma';
import {
  addUsersToSupplyUnit,
  addRepresentativeToUnit,
  updateRole,
} from './user.service';

vi.mock('../config/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    unit: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    userRole: { findFirst: vi.fn() },
    userOrganizationRole: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('../lib/roles');

describe('user.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('addUsersToSupplyUnit', () => {
    it('should add multiple users to a unit successfully', async () => {
      const mockTx = {
        unit: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'unit-1',
            dept_id: 'dept-1',
          }),
        },
        userRole: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'role-1',
            name: Role.GENERAL_STAFF,
          }),
        },
        user: {
          count: vi.fn().mockResolvedValue(2),
        },
        userOrganizationRole: {
          findMany: vi.fn().mockResolvedValue([]),
          create: vi.fn().mockResolvedValue({}),
        },
      };

      (prisma.$transaction as any).mockImplementation(
        (cb: (tx: typeof mockTx) => any) => cb(mockTx)
      );

      const result = await addUsersToSupplyUnit({
        unit_id: 'unit-1',
        users: [{ id: 'user-1' }, { id: 'user-2' }],
      });

      expect(result.count).toBe(2);
      expect(result.message).toBe('2 users processed successfully.');
      expect(mockTx.userOrganizationRole.create).toHaveBeenCalledTimes(2);
    });

    it('should throw NotFoundError if unit does not exist', async () => {
      const mockTx = {
        unit: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      };

      (prisma.$transaction as any).mockImplementation(
        (cb: (tx: typeof mockTx) => any) => cb(mockTx)
      );

      await expect(
        addUsersToSupplyUnit({
          unit_id: 'invalid-unit',
          users: [{ id: 'user-1' }],
        })
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError if role does not exist', async () => {
      const mockTx = {
        unit: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'unit-1',
            dept_id: 'dept-1',
          }),
        },
        userRole: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };

      (prisma.$transaction as any).mockImplementation(
        (cb: (tx: typeof mockTx) => any) => cb(mockTx)
      );

      await expect(
        addUsersToSupplyUnit({
          unit_id: 'unit-1',
          users: [{ id: 'user-1' }],
        })
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError if some users do not exist', async () => {
      const mockTx = {
        unit: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'unit-1',
            dept_id: 'dept-1',
          }),
        },
        userRole: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'role-1',
            name: Role.GENERAL_STAFF,
          }),
        },
        user: {
          count: vi.fn().mockResolvedValue(1),
        },
      };

      (prisma.$transaction as any).mockImplementation(
        (cb: (tx: typeof mockTx) => any) => cb(mockTx)
      );

      await expect(
        addUsersToSupplyUnit({
          unit_id: 'unit-1',
          users: [{ id: 'user-1' }, { id: 'user-2' }],
        })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('addRepresentativeToUnit', () => {
    it('should add representative to unit successfully', async () => {
      const mockTx = {
        unit: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'unit-1',
            department: { id: 'dept-1', code: 'DEPT' },
          }),
        },
        userRole: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'role-1',
            name: Role.REPRESENTATIVE,
          }),
        },
        userOrganizationRole: {
          findMany: vi.fn().mockResolvedValue([]),
          create: vi.fn().mockResolvedValue({}),
        },
        user: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'user-1',
            roles: [],
          }),
        },
      };

      (prisma.$transaction as any).mockImplementation(
        (cb: (tx: typeof mockTx) => any) => cb(mockTx)
      );

      const result = await addRepresentativeToUnit({
        id: 'user-1',
        unit_id: 'unit-1',
      });

      expect(result).toEqual({ id: 'user-1', roles: [] });
    });

    it('should throw NotFoundError if unit does not exist', async () => {
      const mockTx = {
        unit: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      };

      (prisma.$transaction as any).mockImplementation(
        (cb: (tx: typeof mockTx) => any) => cb(mockTx)
      );

      await expect(
        addRepresentativeToUnit({ id: 'user-1', unit_id: 'invalid-unit' })
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw BadRequestError for SUPPLY department', async () => {
      const mockTx = {
        unit: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'unit-1',
            department: { id: 'dept-1', code: 'SUPPLY' },
          }),
        },
      };

      (prisma.$transaction as any).mockImplementation(
        (cb: (tx: typeof mockTx) => any) => cb(mockTx)
      );

      await expect(
        addRepresentativeToUnit({ id: 'user-1', unit_id: 'unit-1' })
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe('updateRole', () => {
    it('should update role successfully', async () => {
      const mockTx = {
        userRole: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'role-1',
            name: Role.GENERAL_STAFF,
          }),
        },
        userOrganizationRole: {
          findMany: vi.fn().mockResolvedValue([]),
          create: vi.fn().mockResolvedValue({ id: 'assign-1' }),
        },
      };

      (rolesLib.isUnitLevelRole as any).mockReturnValue(false);
      (rolesLib.isDeptLevelRole as any).mockReturnValue(true);
      (prisma.$transaction as any).mockImplementation(
        (cb: (tx: typeof mockTx) => any) => cb(mockTx)
      );

      const result = await updateRole('user-1', {
        role: Role.GENERAL_STAFF,
        dept_id: 'dept-1',
      });

      expect(result.data).toEqual({ id: 'assign-1' });
    });

    it('should throw BadRequestError if unit-level role without unit_id', async () => {
      (rolesLib.isUnitLevelRole as any).mockReturnValue(true);
      (rolesLib.isDeptLevelRole as any).mockReturnValue(false);

      const mockTx = {};
      (prisma.$transaction as any).mockImplementation(
        (cb: (tx: typeof mockTx) => any) => cb(mockTx)
      );

      await expect(
        updateRole('user-1', {
          role: Role.GENERAL_STAFF,
          dept_id: 'dept-1',
        })
      ).rejects.toThrow(BadRequestError);
    });

    it('should throw BadRequestError if dept-level role with unit_id', async () => {
      (rolesLib.isUnitLevelRole as any).mockReturnValue(false);
      (rolesLib.isDeptLevelRole as any).mockReturnValue(true);

      const mockTx = {};
      (prisma.$transaction as any).mockImplementation(
        (cb: (tx: typeof mockTx) => any) => cb(mockTx)
      );

      await expect(
        updateRole('user-1', {
          role: Role.GENERAL_STAFF,
          dept_id: 'dept-1',
          unit_id: 'unit-1',
        })
      ).rejects.toThrow(BadRequestError);
    });

    it('should throw NotFoundError if role does not exist', async () => {
      (rolesLib.isUnitLevelRole as any).mockReturnValue(false);
      (rolesLib.isDeptLevelRole as any).mockReturnValue(true);

      const mockTx = {
        userRole: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      };

      (prisma.$transaction as any).mockImplementation(
        (cb: (tx: typeof mockTx) => any) => cb(mockTx)
      );

      await expect(
        updateRole('user-1', {
          role: Role.GENERAL_STAFF,
          dept_id: 'dept-1',
        })
      ).rejects.toThrow(NotFoundError);
    });
  });
});
