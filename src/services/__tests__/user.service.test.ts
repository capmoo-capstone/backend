import { UserRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { prismaMock, txMock } from '../../test/prisma-mock';
import {
  addRole,
  getById,
  listUsers,
  removeRole,
  updateSupplyRole,
} from '../user.service';

describe('user.service', () => {
  it('listUsers returns all users when no filter is given', async () => {
    prismaMock.user.findMany.mockResolvedValue([
      {
        id: 'user-1',
        full_name: 'Staff One',
        roles: [{ role: UserRole.GENERAL_STAFF }],
      },
    ]);
    prismaMock.user.count.mockResolvedValue(1);

    const result = await listUsers({});

    expect(result).toEqual({
      id: 'all',
      entity_type: 'all',
      name: 'All Users',
      total: 1,
      data: [
        {
          id: 'user-1',
          full_name: 'Staff One',
          roles: [UserRole.GENERAL_STAFF],
        },
      ],
    });
    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} })
    );
  });

  it('listUsers filters by unitId and returns the unit entity', async () => {
    prismaMock.unit.findUnique.mockResolvedValue({
      id: 'unit-1',
      name: 'Unit One',
    });
    prismaMock.user.findMany.mockResolvedValue([
      {
        id: 'user-1',
        full_name: 'Staff One',
        roles: [{ role: UserRole.GENERAL_STAFF }],
      },
    ]);
    prismaMock.user.count.mockResolvedValue(1);

    const result = await listUsers({ unitId: 'unit-1' });

    expect(result).toMatchObject({
      id: 'unit-1',
      entity_type: 'unit',
      name: 'Unit One',
      total: 1,
    });
    expect(prismaMock.user.findMany.mock.calls[0][0].where).toEqual({
      roles: { some: { unit_id: 'unit-1' } },
    });
  });

  it('listUsers filters by deptId and returns the department entity', async () => {
    prismaMock.department.findUnique.mockResolvedValue({
      id: 'dept-1',
      name: 'Dept One',
    });
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.user.count.mockResolvedValue(0);

    const result = await listUsers({ deptId: 'dept-1' });

    expect(result).toMatchObject({
      id: 'dept-1',
      entity_type: 'department',
      name: 'Dept One',
      total: 0,
    });
  });

  it('getById returns user details with roles included', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      full_name: 'Staff One',
      roles: [],
    });

    const result = await getById('user-1');

    expect(result.id).toBe('user-1');
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        include: expect.objectContaining({ roles: expect.any(Object) }),
      })
    );
  });

  it('updateSupplyRole adds users and updates role_updated_at', async () => {
    txMock.user.count.mockResolvedValue(1);
    txMock.userOrganizationRole.findFirst.mockResolvedValue(null);
    txMock.userOrganizationRole.findMany.mockResolvedValue([]);
    txMock.userOrganizationRole.create.mockResolvedValue({
      id: 'role-1',
      user_id: 'user-1',
      role: UserRole.GENERAL_STAFF,
    });

    const result = await updateSupplyRole({
      role: UserRole.GENERAL_STAFF,
      new_users: ['user-1'],
      remove_users: [],
    } as any);

    expect(result).toEqual({ added: 1, removed: 0 });
    expect(txMock.userOrganizationRole.create).toHaveBeenCalledWith({
      data: {
        user_id: 'user-1',
        role: UserRole.GENERAL_STAFF,
        dept_id: 'DEPT-SUP-OPS',
        unit_id: null,
      },
    });
    expect(txMock.user.update).toHaveBeenCalled();
  });

  it('addRole adds a new department-level role to an existing user', async () => {
    txMock.user.count.mockResolvedValue(1);
    txMock.userOrganizationRole.findFirst.mockResolvedValue(null);
    txMock.userOrganizationRole.findMany.mockResolvedValue([]);
    txMock.userOrganizationRole.create.mockResolvedValue({
      id: 'role-1',
      user_id: 'user-1',
      role: UserRole.HEAD_OF_DEPARTMENT,
    });

    const result = await addRole({
      user_id: 'user-1',
      role: UserRole.HEAD_OF_DEPARTMENT,
      dept_id: 'dept-1',
    } as any);

    expect(result.role).toBe(UserRole.HEAD_OF_DEPARTMENT);
    expect(txMock.userOrganizationRole.create).toHaveBeenCalledWith({
      data: {
        user_id: 'user-1',
        role: UserRole.HEAD_OF_DEPARTMENT,
        dept_id: 'dept-1',
        unit_id: null,
      },
    });
  });

  it('removeRole removes the role and falls back to guest when no roles remain', async () => {
    txMock.user.count.mockResolvedValue(1);
    txMock.userOrganizationRole.findFirst.mockResolvedValue({ id: 'role-1' });
    txMock.userOrganizationRole.count.mockResolvedValue(0);

    await removeRole({
      user_id: 'user-1',
      role: UserRole.GENERAL_STAFF,
      dept_id: 'dept-1',
      unit_id: 'unit-1',
    } as any);

    expect(txMock.userOrganizationRole.delete).toHaveBeenCalledWith({
      where: { id: 'role-1' },
    });
    expect(txMock.userOrganizationRole.create).toHaveBeenCalledWith({
      data: {
        user_id: 'user-1',
        role: UserRole.GUEST,
        dept_id: 'dept-1',
        unit_id: null,
      },
    });
  });
});
