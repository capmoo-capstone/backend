import { UserRole } from '@prisma/client';

export const deptLevelRoles = new Set<UserRole>([
  UserRole.HEAD_OF_DEPARTMENT,
  UserRole.FINANCE_STAFF,
  UserRole.DOCUMENT_STAFF,
  UserRole.ADMIN,
]);

export const unitLevelRoles = new Set<UserRole>([
  UserRole.HEAD_OF_UNIT,
  UserRole.GENERAL_STAFF,
  UserRole.REPRESENTATIVE,
]);

export const isDeptLevelRole = (role: UserRole): boolean =>
  deptLevelRoles.has(role);

export const isUnitLevelRole = (role: UserRole): boolean =>
  unitLevelRoles.has(role);
