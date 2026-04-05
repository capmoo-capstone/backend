import { UserRole } from '@prisma/client';
import { UpdateUserRoleResponse } from '../types/user.type';

export const upsertUserRoleInternal = async (
  tx: any,
  params: {
    userId: string;
    role: UserRole;
    deptId: string;
    unitId: string | null;
  }
): Promise<UpdateUserRoleResponse> => {
  const { userId, role, deptId, unitId } = params;

  const userRoles = await tx.userOrganizationRole.findMany({
    where: { user_id: userId, dept_id: deptId },
    select: { id: true, role: true, unit_id: true },
  });

  const sameUnitAssignment = userRoles.find((a: any) => a.unit_id === unitId);
  const guestAssignment = userRoles.find((a: any) => a.role === UserRole.GUEST);

  let result: UpdateUserRoleResponse;
  if (sameUnitAssignment) {
    result = await tx.userOrganizationRole.update({
      where: { id: sameUnitAssignment.id },
      data: { role },
    });
  } else if (guestAssignment && userRoles.length === 1) {
    result = await tx.userOrganizationRole.update({
      where: { id: guestAssignment.id },
      data: { role, unit_id: unitId },
    });
  } else {
    result = await tx.userOrganizationRole.create({
      data: {
        user_id: userId,
        role,
        dept_id: deptId,
        unit_id: unitId,
      },
    });
  }

  await tx.user.update({
    where: { id: userId },
    data: { role_updated_at: new Date() },
  });

  return result;
};
