import { z } from 'zod';
import { UserRole, RegisterType } from '@prisma/client';
import { BadRequestError } from '../lib/errors';

export const manageableUserRoles = [
  UserRole.ADMIN,
  UserRole.HEAD_OF_DEPARTMENT,
  UserRole.HEAD_OF_UNIT,
  UserRole.REPRESENTATIVE,
  UserRole.DOCUMENT_STAFF,
  UserRole.FINANCE_STAFF,
  UserRole.GENERAL_STAFF,
  UserRole.GUEST,
] as const;

const RoleAssignmentSchema = z.object({
  role: z.enum(manageableUserRoles),
  dept_id: z.string().trim().min(1),
  unit_id: z.string().trim().min(1).optional(),
});

export const CreateUserSchema = z.object({
  username: z.string().trim().min(1).optional(),
  full_name: z.string().trim().min(1),
  email: z.email().optional(),
  password: z.string().optional(),
  register_type: z.enum(RegisterType).default(RegisterType.STANDARD),
  role: z.enum(manageableUserRoles).optional().default(UserRole.GUEST),
  dept_id: z.string(),
  unit_id: z.string().optional(),
}).refine((data) => {
  if (data.register_type === RegisterType.STANDARD && !data.password) {
    throw new BadRequestError('password is required when register_type is STANDARD');
  }
  if (data.register_type === RegisterType.SSO && data.password) {
    throw new BadRequestError('password is not required when register_type is SSO');
  }
  if (data.register_type === RegisterType.SSO && !data.email) {
    throw new BadRequestError('email is required when register_type is SSO');
  }
  return true;
})

export const ListUsersQuerySchema = z.object({
  unitId: z.string().optional(),
  deptId: z.string().optional(),
  role: z.enum(UserRole).optional(),
});

const supplyDeptRoles = [
  UserRole.HEAD_OF_UNIT,
  UserRole.HEAD_OF_DEPARTMENT,
  UserRole.ADMIN,
  UserRole.DOCUMENT_STAFF,
  UserRole.FINANCE_STAFF,
] as const;

export const UpdateSupplyRoleSchema = z
  .object({
    role: z.enum(supplyDeptRoles),
    unit_id: z.string().optional(),
    new_users: z.array(z.uuid()).default([]),
    remove_users: z.array(z.uuid()).default([]),
  })
  .refine(
    (data) =>
      data.role !== UserRole.HEAD_OF_DEPARTMENT || data.new_users.length <= 1,
    {
      message: 'HEAD_OF_DEPARTMENT can only have one person',
      path: ['new_users'],
    }
  )
  .refine(
    (data) => data.role !== UserRole.HEAD_OF_UNIT || Boolean(data.unit_id),
    {
      message: 'unit_id is required for HEAD_OF_UNIT',
      path: ['unit_id'],
    }
  );

export const AddRoleSchema = z.object({
  user_id: z.uuid(),
  ...RoleAssignmentSchema.shape,
});

export const RemoveRoleSchema = z.object({
  user_id: z.uuid(),
  ...RoleAssignmentSchema.shape,
});

// ── Types ─────────────────────────────────────────────────────────────────────

export type CreateUserDto = z.infer<typeof CreateUserSchema>;
export type ListUsersQueryDto = z.infer<typeof ListUsersQuerySchema>;
export type UpdateSupplyRoleDto = z.infer<typeof UpdateSupplyRoleSchema>;
export type AddRoleDto = z.infer<typeof AddRoleSchema>;
export type RemoveRoleDto = z.infer<typeof RemoveRoleSchema>;
