import { Role } from '@prisma/client';

export const deptLevelRoles = new Set<Role>([
  Role.HEAD_OF_DEPARTMENT,
  Role.FINANCE_STAFF,
  Role.DOCUMENT_STAFF,
  Role.ADMIN,
  Role.GUEST,
]);

export const unitLevelRoles = new Set<Role>([
  Role.HEAD_OF_UNIT,
  Role.GENERAL_STAFF,
  Role.REPRESENTATIVE,
]);

export const isDeptLevelRole = (role: Role): boolean =>
  deptLevelRoles.has(role);

export const isUnitLevelRole = (role: Role): boolean =>
  unitLevelRoles.has(role);
