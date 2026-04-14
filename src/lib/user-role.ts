import { Prisma, UserRole } from '@prisma/client';
import { BadRequestError, NotFoundError } from './errors';
import { UpdateUserRoleResponse } from '../types/user.type';

/**
 * เพิ่ม role ให้ user
 * - unit-level (มี unitId): มีได้แค่ 1 role ต่อ 1 unit → update slot เดิม
 * - dept-level (unitId = null): มีได้หลาย role ใน dept เดียวกัน
 *   (แต่ไม่สร้างแถวซ้ำ role เดิม)
 * - ถ้ามีแค่ GUEST เดียวใน dept นั้น → replace GUEST
 * - otherwise → create ใหม่
 */
export const addRoleInternal = async (
  tx: Prisma.TransactionClient,
  params: {
    userId: string;
    role: UserRole;
    deptId: string;
    unitId: string | null;
  }
): Promise<UpdateUserRoleResponse> => {
  const { userId, role, deptId, unitId } = params;

  const existingRoles = await tx.userOrganizationRole.findMany({
    where: { user_id: userId, dept_id: deptId },
    select: { id: true, role: true, unit_id: true },
  });

  const sameUnitSlot =
    unitId !== null ? existingRoles.find((r) => r.unit_id === unitId) : null;
  const onlyGuest =
    existingRoles.length === 1 && existingRoles[0].role === UserRole.GUEST;

  let result: UpdateUserRoleResponse;

  if (sameUnitSlot) {
    // unit-level: same dept + same unit → update role นั้น
    result = await tx.userOrganizationRole.update({
      where: { id: sameUnitSlot.id },
      data: { role },
    });
  } else if (onlyGuest) {
    // GUEST เดียวใน dept → replace
    result = await tx.userOrganizationRole.update({
      where: { id: existingRoles[0].id },
      data: { role, unit_id: unitId },
    });
  } else {
    result = await tx.userOrganizationRole.create({
      data: { user_id: userId, role, dept_id: deptId, unit_id: unitId },
    });
  }

  await tx.user.update({
    where: { id: userId },
    data: { role_updated_at: new Date() },
  });

  return result;
};

/**
 * ลบ role ออก → ถ้าไม่เหลือ role ใน dept นั้นเลย fallback เป็น GUEST
 */
export const removeRoleInternal = async (
  tx: Prisma.TransactionClient,
  params: {
    userId: string;
    role: UserRole;
    deptId: string;
    unitId: string | null;
  }
): Promise<void> => {
  const { userId, role, deptId, unitId } = params;

  const target = await tx.userOrganizationRole.findFirst({
    where: { user_id: userId, role, dept_id: deptId, unit_id: unitId },
  });

  if (!target) {
    throw new NotFoundError(
      `Role ${role} not found for this user in the specified dept/unit`
    );
  }

  await tx.userOrganizationRole.delete({ where: { id: target.id } });

  const remaining = await tx.userOrganizationRole.count({
    where: { user_id: userId, dept_id: deptId },
  });

  if (remaining === 0) {
    await tx.userOrganizationRole.create({
      data: {
        user_id: userId,
        role: UserRole.GUEST,
        dept_id: deptId,
        unit_id: null,
      },
    });
  }

  await tx.user.update({
    where: { id: userId },
    data: { role_updated_at: new Date() },
  });
};

/**
 * ตรวจว่า user มีอยู่ใน db ไหม (ใช้ใน service layer ก่อนเรียก helper)
 */
export const assertUsersExist = async (
  tx: Prisma.TransactionClient,
  userIds: string[]
): Promise<void> => {
  if (userIds.length === 0) return;

  const found = await tx.user.count({ where: { id: { in: userIds } } });
  if (found !== userIds.length) {
    throw new NotFoundError('One or more users not found');
  }
};

/**
 * validate input ที่ใช้ซ้ำหลาย endpoint
 */
export const assertNoDuplicatesOrOverlap = (
  newUsers: string[],
  removeUsers: string[]
): void => {
  if (
    new Set(newUsers).size !== newUsers.length ||
    new Set(removeUsers).size !== removeUsers.length
  ) {
    throw new BadRequestError('Duplicate user IDs are not allowed');
  }

  const overlap = newUsers.filter((id) => removeUsers.includes(id));
  if (overlap.length > 0) {
    throw new BadRequestError(
      'The same user cannot be added and removed in one request'
    );
  }
};
