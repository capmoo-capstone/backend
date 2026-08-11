import { UserRole, RegisterType } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { prismaMock, txMock } from '../../test/prisma-mock';
import {
  addRole,
  getById,
  listUsers,
  removeRole,
  updateSupplyRole,
} from '../user.service';

const actor = {
  id: 'admin-1',
  username: 'admin',
  full_name: 'Admin User',
  token: 'token',
  roles: [],
  is_delegated: false,
  delegated_by: [],
};

describe('user.service', () => {
  it('listUsers returns all users when no filter is given', async () => {
    prismaMock.user.findMany.mockResolvedValue([
      {
        id: 'user-1',
        full_name: 'Staff One',
        register_type: RegisterType.STANDARD,
        last_login_at: null,
        roles: [{ role: UserRole.GENERAL_STAFF }],
      },
    ] as any);
    prismaMock.user.count.mockResolvedValue(1);

    const result = await listUsers(1, 10, { unitId: [], deptId: [], role: [] });

    expect(result).toEqual({
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
      data: [
        {
          id: 'user-1',
          full_name: 'Staff One',
          register_type: RegisterType.STANDARD,
          last_login_at: null,
          roles: [{ role: UserRole.GENERAL_STAFF }],
        },
      ],
    });
    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} })
    );
  });

  it('listUsers filters by unitId', async () => {
    prismaMock.user.findMany.mockResolvedValue([
      {
        id: 'user-1',
        full_name: 'Staff One',
        roles: [{ role: UserRole.GENERAL_STAFF }],
      },
    ] as any);
    prismaMock.user.count.mockResolvedValue(1);

    const result = await listUsers(1, 10, { unitId: ['unit-1'], deptId: [], role: [] });

    expect(result).toMatchObject({
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    });
    expect(prismaMock.user.findMany.mock.calls[0][0].where).toEqual({
      roles: { some: { unit_id: { in: ['unit-1'] } } },
    });
  });

  it('listUsers filters by deptId', async () => {
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.user.count.mockResolvedValue(0);

    const result = await listUsers(1, 10, { deptId: ['dept-1'], unitId: [], role: [] });

    expect(result).toMatchObject({
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0,
      data: [],
    });
    expect(prismaMock.user.findMany.mock.calls[0][0].where).toEqual({
      roles: { some: { dept_id: { in: ['dept-1'] } } },
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
        select: expect.objectContaining({ roles: expect.any(Object) }),
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

    const result = await updateSupplyRole(actor, {
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
    expect(txMock.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: 'USER_MANAGEMENT',
          event_type: 'USER_ROLE_ASSIGNED',
          target_type: 'USER',
          actor_id: actor.id,
        }),
      })
    );
  });

  it('addRole adds a new department-level role to an existing user', async () => {
    txMock.user.count.mockResolvedValue(1);
    txMock.department.findUnique.mockResolvedValue({ id: 'dept-1' });
    txMock.userOrganizationRole.findFirst.mockResolvedValue(null);
    txMock.userOrganizationRole.findMany.mockResolvedValue([]);
    txMock.userOrganizationRole.create.mockResolvedValue({
      id: 'role-1',
      user_id: 'user-1',
      role: UserRole.HEAD_OF_DEPARTMENT,
      dept_id: 'dept-1',
      unit_id: null,
    });

    const result = await addRole(actor, {
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
    expect(txMock.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event_type: 'USER_ROLE_ASSIGNED',
          metadata: expect.objectContaining({
            userId: 'user-1',
            role: UserRole.HEAD_OF_DEPARTMENT,
            departmentId: 'dept-1',
            unitId: null,
          }),
        }),
      })
    );
  });

  it('removeRole removes the role and falls back to guest when no roles remain', async () => {
    txMock.user.count.mockResolvedValue(1);
    txMock.department.findUnique.mockResolvedValue({ id: 'dept-1' });
    txMock.unit.findUnique.mockResolvedValue({
      id: 'unit-1',
      dept_id: 'dept-1',
    });
    txMock.userOrganizationRole.findFirst.mockResolvedValue({
      id: 'role-1',
      user_id: 'user-1',
      role: UserRole.GENERAL_STAFF,
      dept_id: 'dept-1',
      unit_id: 'unit-1',
    });
    txMock.userOrganizationRole.count.mockResolvedValue(0);

    await removeRole(actor, {
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
    expect(txMock.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event_type: 'USER_ROLE_REMOVED',
          diff: expect.arrayContaining([
            expect.objectContaining({
              field: 'role',
              oldValue: UserRole.GENERAL_STAFF,
              newValue: null,
            }),
          ]),
        }),
      })
    );
  });

  it('does not allow an ADMIN role API to assign SUPER_ADMIN', async () => {
    txMock.user.count.mockResolvedValue(1);

    await expect(
      addRole(actor, {
        user_id: 'user-1',
        role: UserRole.SUPER_ADMIN,
        dept_id: 'DEPT-SUP-OPS',
      } as any)
    ).rejects.toThrow('SUPER_ADMIN role cannot be managed here');
  });
});
