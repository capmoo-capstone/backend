import { UserRole } from '@prisma/client';
import { AuthPayload, AuthRoleDetail } from '../types/auth.type';
import { OPS_DEPT_ID, REGISTRATION_DEPT_ID } from './constant';
import { ForbiddenError } from './errors';

export enum Capability {
  SUPPLY_ACCESS = 'SUPPLY_ACCESS',
  PROJECT_CREATE = 'PROJECT_CREATE',
  PROJECT_IMPORT = 'PROJECT_IMPORT',
  PROJECT_ASSIGN = 'PROJECT_ASSIGN',
  PROJECT_CHANGE_ASSIGNEE = 'PROJECT_CHANGE_ASSIGNEE',
  PROJECT_ADD_ASSIGNEE = 'PROJECT_ADD_ASSIGNEE',
  PROJECT_CLAIM = 'PROJECT_CLAIM',
  PROJECT_ACCEPT = 'PROJECT_ACCEPT',
  PROJECT_RETURN = 'PROJECT_RETURN',
  PROJECT_UPDATE = 'PROJECT_UPDATE',
  PROJECT_CANCEL = 'PROJECT_CANCEL',
  PROJECT_APPROVE_CANCELLATION = 'PROJECT_APPROVE_CANCELLATION',
  PROJECT_COMPLETE_PROCUREMENT = 'PROJECT_COMPLETE_PROCUREMENT',
  PROJECT_CLOSE = 'PROJECT_CLOSE',
  PROJECT_DELETE = 'PROJECT_DELETE',
  SUBMISSION_CREATE = 'SUBMISSION_CREATE',
  SUBMISSION_APPROVE = 'SUBMISSION_APPROVE',
  SUBMISSION_PROPOSE = 'SUBMISSION_PROPOSE',
  SUBMISSION_SIGN = 'SUBMISSION_SIGN',
  INSTALLMENT_CREATE = 'INSTALLMENT_CREATE',
  INSTALLMENT_EXPORT = 'INSTALLMENT_EXPORT',
  INSTALLMENT_REQUEST_EDIT = 'INSTALLMENT_REQUEST_EDIT',
  CONTRACT_MANAGE = 'CONTRACT_MANAGE',
}

const {
  ADMIN,
  REPRESENTATIVE,
  HEAD_OF_DEPARTMENT,
  HEAD_OF_UNIT,
  DOCUMENT_STAFF,
  FINANCE_STAFF,
  GENERAL_STAFF,
} = UserRole;

const supplyAccessRoles = new Set<UserRole>([
  ADMIN,
  HEAD_OF_DEPARTMENT,
  HEAD_OF_UNIT,
  DOCUMENT_STAFF,
  FINANCE_STAFF,
  GENERAL_STAFF,
]);

const supplyRolesForCapability: Partial<Record<Capability, UserRole[]>> = {
  [Capability.PROJECT_CREATE]: [REPRESENTATIVE, DOCUMENT_STAFF],
  [Capability.PROJECT_IMPORT]: [DOCUMENT_STAFF],
  [Capability.PROJECT_ASSIGN]: [HEAD_OF_UNIT],
  [Capability.PROJECT_CHANGE_ASSIGNEE]: [HEAD_OF_UNIT],
  [Capability.PROJECT_ADD_ASSIGNEE]: [GENERAL_STAFF, HEAD_OF_UNIT, ADMIN],
  [Capability.PROJECT_CLAIM]: [GENERAL_STAFF],
  [Capability.PROJECT_ACCEPT]: [GENERAL_STAFF],
  [Capability.PROJECT_RETURN]: [GENERAL_STAFF],
  [Capability.PROJECT_UPDATE]: [GENERAL_STAFF, DOCUMENT_STAFF, HEAD_OF_UNIT],
  [Capability.PROJECT_CANCEL]: [
    GENERAL_STAFF,
    DOCUMENT_STAFF,
    HEAD_OF_UNIT,
    HEAD_OF_DEPARTMENT,
  ],
  [Capability.PROJECT_APPROVE_CANCELLATION]: [HEAD_OF_DEPARTMENT, HEAD_OF_UNIT],
  [Capability.PROJECT_COMPLETE_PROCUREMENT]: [GENERAL_STAFF],
  [Capability.PROJECT_CLOSE]: [FINANCE_STAFF],
  [Capability.SUBMISSION_CREATE]: [GENERAL_STAFF],
  [Capability.SUBMISSION_APPROVE]: [HEAD_OF_UNIT],
  [Capability.SUBMISSION_PROPOSE]: [DOCUMENT_STAFF, GENERAL_STAFF],
  [Capability.SUBMISSION_SIGN]: [DOCUMENT_STAFF, GENERAL_STAFF],
  [Capability.INSTALLMENT_CREATE]: [GENERAL_STAFF],
  [Capability.INSTALLMENT_EXPORT]: [FINANCE_STAFF],
  [Capability.INSTALLMENT_REQUEST_EDIT]: [FINANCE_STAFF],
};

const isSupplyRole = (role: AuthRoleDetail): boolean =>
  role.dept_id === OPS_DEPT_ID && supplyAccessRoles.has(role.role);

export const hasRole = (user: AuthPayload, role: UserRole): boolean =>
  user.roles.some((assignedRole) => assignedRole.role === role);

export const isSuperAdmin = (user: AuthPayload): boolean =>
  hasRole(user, UserRole.SUPER_ADMIN);

export const hasSupplyAccess = (user: AuthPayload): boolean =>
  isSuperAdmin(user) || user.roles.some(isSupplyRole);

export const hasOrganizationWideReadAccess = (user: AuthPayload): boolean =>
  hasSupplyAccess(user) ||
  user.roles.some(
    (role) =>
      role.role === UserRole.GENERAL_STAFF &&
      role.dept_id === REGISTRATION_DEPT_ID
  );

export const hasCapability = (
  user: AuthPayload,
  capability: Capability
): boolean => {
  if (isSuperAdmin(user)) return true;

  if (capability === Capability.PROJECT_DELETE) return false;
  if (
    capability === Capability.SUPPLY_ACCESS ||
    capability === Capability.CONTRACT_MANAGE
  ) {
    return hasSupplyAccess(user);
  }
  if (capability === Capability.PROJECT_CREATE) {
    return user.roles.some(
      (role) =>
        role.role === UserRole.REPRESENTATIVE ||
        role.role === UserRole.DOCUMENT_STAFF
    );
  }

  const allowedRoles = supplyRolesForCapability[capability];
  return (
    !!allowedRoles &&
    user.roles.some(
      (role) => role.dept_id === OPS_DEPT_ID && allowedRoles.includes(role.role)
    )
  );
};

export const assertCapability = (
  user: AuthPayload,
  capability: Capability
): void => {
  if (!hasCapability(user, capability)) {
    throw new ForbiddenError('Insufficient permissions');
  }
};
