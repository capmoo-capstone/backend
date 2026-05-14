import { UserRole } from '@prisma/client';
import { prisma } from '../config/prisma';
import { OPS_DEPT_ID } from '../lib/constant';
import { NotFoundError } from '../lib/errors';
import {
  OpsStaffSettingsResponse,
  OpsStaffSettingsRole,
  OpsUnitSettingsResponse,
  RepresentativeSettingsResponse,
} from '../types/settings.type';

const opsStaffSettingsRoles: OpsStaffSettingsRole[] = [
  UserRole.HEAD_OF_DEPARTMENT,
  UserRole.DOCUMENT_STAFF,
  UserRole.FINANCE_STAFF,
  UserRole.ADMIN,
];

export const getOpsUnits = async (): Promise<OpsUnitSettingsResponse> => {
  const now = new Date();
  const units = await prisma.unit.findMany({
    where: { dept_id: OPS_DEPT_ID },
    select: {
      id: true,
      dept_id: true,
      name: true,
      type: true,
      organization_roles: {
        where: {
          dept_id: OPS_DEPT_ID,
          role: { in: [UserRole.HEAD_OF_UNIT, UserRole.GENERAL_STAFF] },
        },
        select: {
          role: true,
          user: {
            select: {
              id: true,
              full_name: true,
              delegations_given: {
                where: {
                  is_active: true,
                  start_date: { lte: now },
                  OR: [{ end_date: null }, { end_date: { gte: now } }],
                },
                select: {
                  id: true,
                  start_date: true,
                  end_date: true,
                  delegatee: {
                    select: {
                      id: true,
                      full_name: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  return {
    units: units.map((unit) => ({
      id: unit.id,
      dept_id: unit.dept_id,
      name: unit.name,
      type: unit.type,
      head: (() => {
        const headRole = unit.organization_roles.find((role) => role.role === UserRole.HEAD_OF_UNIT);
        if (!headRole) return null;
        const d = headRole.user.delegations_given[0];
        return {
          id: headRole.user.id,
          full_name: headRole.user.full_name,
          active_delegation: d ? {
            id: d.id,
            delegatee: d.delegatee,
            start_date: d.start_date,
            end_date: d.end_date,
          } : null,
        };
      })(),
      users: unit.organization_roles
        .filter((role) => role.role === UserRole.GENERAL_STAFF)
        .map((role) => ({
          id: role.user.id,
          full_name: role.user.full_name,
        }))
        .sort((a, b) => a.full_name.localeCompare(b.full_name)),
    })),
  };
};

export const getRepresentatives =
  async (): Promise<RepresentativeSettingsResponse> => {
    const departments = await prisma.department.findMany({
      where: { id: { not: OPS_DEPT_ID } },
      select: {
        id: true,
        name: true,
        units: {
          select: {
            id: true,
            name: true,
            organization_roles: {
              where: { role: UserRole.REPRESENTATIVE },
              select: {
                user: {
                  select: {
                    id: true,
                    full_name: true,
                  },
                },
              },
            },
          },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    return {
      departments: departments.map((department) => ({
        id: department.id,
        name: department.name,
        units: department.units.map((unit) => ({
          id: unit.id,
          name: unit.name,
          representative: unit.organization_roles[0] ? {
            id: unit.organization_roles[0].user.id,
            full_name: unit.organization_roles[0].user.full_name,
          } : null,
        })),
      })),
    };
  };

export const getOpsStaff = async (): Promise<OpsStaffSettingsResponse> => {
  const department = await prisma.department.findUnique({
    where: { id: OPS_DEPT_ID },
    select: {
      id: true,
      name: true,
      organization_roles: {
        where: {
          role: { in: opsStaffSettingsRoles },
          unit_id: null,
        },
        select: {
          role: true,
          user: {
            select: {
              id: true,
              full_name: true,
              delegations_given: {
                where: {
                  is_active: true,
                  start_date: { lte: new Date() },
                  OR: [{ end_date: null }, { end_date: { gte: new Date() } }],
                },
                select: {
                  id: true,
                  start_date: true,
                  end_date: true,
                  delegatee: {
                    select: {
                      id: true,
                      full_name: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!department) {
    throw new NotFoundError('Department not found');
  }

  return {
    department: {
      id: department.id,
      name: department.name,
    },
    roles: opsStaffSettingsRoles.map((role) => {
      const users = department.organization_roles
        .filter((organizationRole) => organizationRole.role === role)
        .map((organizationRole) => ({
          id: organizationRole.user.id,
          full_name: organizationRole.user.full_name,
          active_delegation: organizationRole.user.delegations_given[0] ?? null,
        }))
        .sort((a, b) => a.full_name.localeCompare(b.full_name));

      if (role === UserRole.HEAD_OF_DEPARTMENT) {
        return {
          role,
          user: {
            id: users[0].id,
            full_name: users[0].full_name,
          },
          active_delegation: users[0]?.active_delegation || null,
        };
      }

      return { role, users: users.map((u) => ({ id: u.id, full_name: u.full_name })) };
    }),
  };
};
