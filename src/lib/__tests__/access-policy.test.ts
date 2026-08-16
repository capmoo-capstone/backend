import { UserRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { Capability, hasCapability, hasSupplyAccess } from '../access-policy';
import { OPS_DEPT_ID } from '../constant';
import { canReadProject, projectReadWhere } from '../project-scope';

const user = (roles: unknown[]) =>
  ({
    id: 'user-1',
    roles,
  }) as any;

describe('access policy', () => {
  it('does not grant broad supply access to an OPS guest', () => {
    const guest = user([
      { role: UserRole.GUEST, dept_id: OPS_DEPT_ID, unit_id: null },
    ]);

    expect(hasSupplyAccess(guest)).toBe(false);
    expect(projectReadWhere(guest)).toEqual({
      requesting_dept_id: { in: [OPS_DEPT_ID] },
    });
  });

  it('uses supply role and department together for capabilities', () => {
    const generalStaff = user([
      {
        role: UserRole.GENERAL_STAFF,
        dept_id: OPS_DEPT_ID,
        unit_id: 'unit-1',
      },
    ]);
    const externalDocumentStaff = user([
      { role: UserRole.DOCUMENT_STAFF, dept_id: 'dept-1', unit_id: null },
    ]);

    expect(hasCapability(generalStaff, Capability.PROJECT_CLAIM)).toBe(true);
    expect(hasCapability(generalStaff, Capability.PROJECT_CLOSE)).toBe(false);
    expect(
      hasCapability(externalDocumentStaff, Capability.PROJECT_CREATE)
    ).toBe(true);
    expect(
      hasCapability(externalDocumentStaff, Capability.PROJECT_IMPORT)
    ).toBe(false);
  });

  it('limits external users to projects requested by their departments', () => {
    const externalUser = user([
      { role: UserRole.REPRESENTATIVE, dept_id: 'dept-1', unit_id: 'unit-1' },
    ]);

    expect(canReadProject(externalUser, { requesting_dept_id: 'dept-1' })).toBe(
      true
    );
    expect(canReadProject(externalUser, { requesting_dept_id: 'dept-2' })).toBe(
      false
    );
  });
});
