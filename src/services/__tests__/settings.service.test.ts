import { UnitResponsibleType, UserRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { OPS_DEPT_ID } from '../../lib/constant';
import { prismaMock } from '../../test/prisma-mock';
import { getOpsStaff, getOpsUnits } from '../settings.service';

describe('settings.service', () => {
  it('getOpsUnits shows only the active delegation matching the unit head scope', async () => {
    prismaMock.unit.findMany.mockResolvedValue([
      {
        id: 'unit-1',
        dept_id: OPS_DEPT_ID,
        name: 'Unit One',
        type: [UnitResponsibleType.LT100K],
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

    const result = await getOpsUnits();

    expect(result.units[0].head?.active_delegation).toMatchObject({
      id: 'matching-delegation',
      role: UserRole.HEAD_OF_UNIT,
      unit_id: 'unit-1',
    });
  });

  it('getOpsStaff shows only the active delegation matching the department head scope', async () => {
    prismaMock.department.findUnique.mockResolvedValue({
      id: OPS_DEPT_ID,
      name: 'Supply Operation',
      organization_roles: [
        {
          role: UserRole.HEAD_OF_DEPARTMENT,
          user: {
            id: 'head-1',
            full_name: 'Head One',
            delegations_given: [
              {
                id: 'unit-delegation',
                role: UserRole.HEAD_OF_UNIT,
                unit_id: 'unit-1',
                start_date: new Date('2026-06-01T00:00:00.000Z'),
                end_date: null,
                delegatee: {
                  id: 'delegatee-1',
                  full_name: 'Delegatee One',
                },
              },
              {
                id: 'department-delegation',
                role: UserRole.HEAD_OF_DEPARTMENT,
                unit_id: null,
                start_date: new Date('2026-06-01T00:00:00.000Z'),
                end_date: null,
                delegatee: {
                  id: 'delegatee-2',
                  full_name: 'Delegatee Two',
                },
              },
            ],
          },
        },
      ],
    });

    const result = await getOpsStaff();

    expect(result.roles[0]).toMatchObject({
      role: UserRole.HEAD_OF_DEPARTMENT,
      active_delegation: {
        id: 'department-delegation',
        role: UserRole.HEAD_OF_DEPARTMENT,
        unit_id: null,
      },
    });
  });
});
