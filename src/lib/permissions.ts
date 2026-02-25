import { UserRole } from '@prisma/client';
import { OPS_DEPT_ID } from './constant';
import { AuthPayload } from './types';

export const haveSupplyPermission = (user: AuthPayload): boolean =>
  user.roles.some((r) => r.dept_id === OPS_DEPT_ID) || isSuperAdmin(user);

export const isSuperAdmin = (user: AuthPayload): boolean =>
  user.roles.some((r) => r.role === UserRole.SUPER_ADMIN);

export const getDeptIdsForUser = (user: AuthPayload): string[] => {
  const deptIds = new Set<string>();
  user.roles.forEach((r) => {
    if (r.dept_id) deptIds.add(r.dept_id);
  });
  return Array.from(deptIds);
};
