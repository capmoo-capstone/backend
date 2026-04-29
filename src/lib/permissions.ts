import { UserRole } from '@prisma/client';
import { OPS_DEPT_ID } from './constant';
import { AuthPayload } from '../types/auth.type';

export const haveSupplyPermission = (user: AuthPayload): boolean =>
  user.roles.some((r) => r.dept_id === OPS_DEPT_ID) || isSuperAdmin(user);

export const isSuperAdmin = (user: AuthPayload): boolean =>
  user.roles.some((r) => r.role === UserRole.SUPER_ADMIN);

export const isHeadOfSupplyDept = (user: AuthPayload): boolean =>
  user.roles.some(
    (r) => r.role === UserRole.HEAD_OF_DEPARTMENT && r.dept_id === OPS_DEPT_ID
  ) ||
  (user.is_delegated &&
    user.delegated_by.some((r) =>
      r.roles.some(role => role.role === UserRole.HEAD_OF_DEPARTMENT && role.dept_id === OPS_DEPT_ID)
    ));

export const isHeadOfSupplyUnit = (user: AuthPayload): boolean =>
  user.roles.some(
    (r) => r.role === UserRole.HEAD_OF_UNIT && r.dept_id === OPS_DEPT_ID
  ) ||
  (user.is_delegated &&
    user.delegated_by.some((r) =>
      r.roles.some((role) => role.role === UserRole.HEAD_OF_UNIT && role.dept_id === OPS_DEPT_ID)
    ));

export const getDeptIdsForUser = (user: AuthPayload): string[] => {
  const deptIds = new Set<string>();
  user.roles.forEach((r) => {
    if (r.dept_id) deptIds.add(r.dept_id);
  });
  user.delegated_by.forEach((d) => {
    d.roles.forEach((r) => {
      if (r.dept_id) deptIds.add(r.dept_id);
    });
  });
  return Array.from(deptIds);
};

export const getUnitIdsForUser = (user: AuthPayload): string[] => {
  const unitIds = new Set<string>();
  user.roles.forEach((r) => {
    if (r.unit_id) unitIds.add(r.unit_id);
  });
  user.delegated_by.forEach((d) => {
    d.roles.forEach((r) => {
      if (r.unit_id) unitIds.add(r.unit_id);
    });
  });
  return Array.from(unitIds);
};
