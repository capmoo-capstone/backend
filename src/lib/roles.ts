import { Prisma, UserRole } from '@prisma/client';
import { OPS_DEPT_ID } from './constant';
import { NotFoundError, BadRequestError } from './errors';

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

type RoleScope = {
  role: UserRole;
  deptId: string;
  unitId: string | null;
};

export const assertDepartmentUnitScope = async (
  tx: Prisma.TransactionClient,
  params: Pick<RoleScope, 'deptId' | 'unitId'>
): Promise<void> => {
  const department = await tx.department.findUnique({
    where: { id: params.deptId },
    select: { id: true },
  });
  if (!department) throw new NotFoundError('Department not found');

  if (!params.unitId) return;

  const unit = await tx.unit.findUnique({
    where: { id: params.unitId },
    select: { dept_id: true },
  });
  if (!unit) throw new NotFoundError('Unit not found');
  if (unit.dept_id !== params.deptId) {
    throw new BadRequestError('Unit does not belong to this department');
  }
};

export const assertManageableRoleScope = async (
  tx: Prisma.TransactionClient,
  params: RoleScope
): Promise<void> => {
  if (params.role === UserRole.SUPER_ADMIN) {
    throw new BadRequestError('SUPER_ADMIN role cannot be managed here');
  }

  await assertDepartmentUnitScope(tx, params);

  if (isUnitLevelRole(params.role) && !params.unitId) {
    throw new BadRequestError('Unit is required for unit-level roles');
  }

  if (isDeptLevelRole(params.role) && params.unitId) {
    throw new BadRequestError('Unit is not allowed for department-level roles');
  }

  if (params.role === UserRole.ADMIN && params.deptId !== OPS_DEPT_ID) {
    throw new BadRequestError('ADMIN can only be assigned to Supply Operation');
  }
};
