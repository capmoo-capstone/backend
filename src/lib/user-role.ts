import { Prisma, UserRole } from '@prisma/client';
import { UpdateUserRoleResponse } from '../types/user.type';

export const upsertUserRoleInternal = async (
  tx: Prisma.TransactionClient,
  params: {
    userId: string;
    role: UserRole;
    deptId: string;
    unitId: string | null;
  }
): Promise<UpdateUserRoleResponse> => {
  const { userId, role, deptId, unitId } = params;

  const existing = await tx.userOrganizationRole.findFirst({
    where: { user_id: userId, dept_id: deptId },
  });

  const isCrossScope =
    existing && (existing.unit_id === null) !== (unitId === null);

  let result: UpdateUserRoleResponse;
  if (!existing) {
    result = await tx.userOrganizationRole.create({
      data: { user_id: userId, role, dept_id: deptId, unit_id: unitId },
    });
  } else if (isCrossScope) {
    await tx.userOrganizationRole.delete({ where: { id: existing.id } });
    result = await tx.userOrganizationRole.create({
      data: { user_id: userId, role, dept_id: deptId, unit_id: unitId },
    });
  } else {
    result = await tx.userOrganizationRole.update({
      where: { id: existing.id },
      data: { role, unit_id: unitId },
    });
  }

  await tx.user.update({
    where: { id: userId },
    data: { role_updated_at: new Date() },
  });

  return result;
};
