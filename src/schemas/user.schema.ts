import { z } from 'zod';
import { UserRole } from '@prisma/client';

export const RegisterUserSchema = z.object({
  username: z.string(),
  full_name: z.string(),
  email: z.email().optional(),
  role: z.enum(UserRole).default(UserRole.GUEST),
  dept_id: z.string(),
  unit_id: z.string().optional(),
});

const supplyDeptRoles = [
  UserRole.HEAD_OF_DEPARTMENT,
  UserRole.ADMIN,
  UserRole.DOCUMENT_STAFF,
  UserRole.FINANCE_STAFF,
] as const;

export const UpdateSupplyRoleSchema = z
  .object({
    role: z.enum(supplyDeptRoles),
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
  );

export const AddRoleSchema = z.object({
  user_id: z.uuid(),
  role: z.enum(UserRole),
  dept_id: z.string(),
  unit_id: z.string().optional(),
});

export const RemoveRoleSchema = z.object({
  user_id: z.uuid(),
  role: z.enum(UserRole),
  dept_id: z.string(),
  unit_id: z.string().optional(),
});

// ── Types ─────────────────────────────────────────────────────────────────────

export type RegisterUserDto = z.infer<typeof RegisterUserSchema>;
export type UpdateSupplyRoleDto = z.infer<typeof UpdateSupplyRoleSchema>;
export type AddRoleDto = z.infer<typeof AddRoleSchema>;
export type RemoveRoleDto = z.infer<typeof RemoveRoleSchema>;
