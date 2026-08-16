import { Prisma } from '@prisma/client';
import { AuthPayload } from '../types/auth.type';
import { getDeptIdsForUser } from './permissions';
import { ForbiddenError } from './errors';
import { hasOrganizationWideReadAccess } from './access-policy';

export const projectReadWhere = (
  user: AuthPayload
): Prisma.ProjectWhereInput => {
  if (hasOrganizationWideReadAccess(user)) return {};

  const deptIds = getDeptIdsForUser(user);
  return deptIds.length > 0
    ? { requesting_dept_id: { in: deptIds } }
    : { id: { in: [] } };
};

export const canReadProject = (
  user: AuthPayload,
  project: { requesting_dept_id: string }
): boolean => {
  return (
    hasOrganizationWideReadAccess(user) ||
    getDeptIdsForUser(user).includes(project.requesting_dept_id)
  );
};

export const assertCanReadProject = (
  user: AuthPayload,
  project: { requesting_dept_id: string }
): void => {
  if (!canReadProject(user, project)) {
    throw new ForbiddenError('You do not have access to this project');
  }
};

export const scopedProjectWhere = (
  user: AuthPayload,
  where: Prisma.ProjectWhereInput = {}
): Prisma.ProjectWhereInput => {
  const scope = projectReadWhere(user);
  return Object.keys(scope).length === 0 ? where : { AND: [scope, where] };
};
