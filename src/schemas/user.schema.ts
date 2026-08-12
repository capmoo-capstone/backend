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

const RegisterTypes = z
  .union([
    z.enum(RegisterType),
    z
      .array(z.enum(RegisterType))
      .min(1, 'At least one login method is required'),
  ])
  .default([RegisterType.STANDARD])
  .transform((types) => (Array.isArray(types) ? types : [types]))
  .refine((types) => new Set(types).size === types.length, {
    message: 'Login methods must be unique',
  });

export const CreateUserSchema = z
  .object({
    username: z.string().trim().min(1).optional(),
    full_name: z.string().trim().min(1),
    email: z.email().optional(),
    password: z.string().optional(),
    register_type: RegisterTypes,
    role: z.enum(manageableUserRoles).optional().default(UserRole.GUEST),
    dept_id: z.string(),
    unit_id: z.string().optional(),
  })
  .refine((data) => {
    const supportsStandard = data.register_type.includes(RegisterType.STANDARD);
    const supportsSso = data.register_type.includes(RegisterType.SSO);

    if (supportsStandard && !data.password) {
      throw new BadRequestError(
        'password is required when register_type is STANDARD'
      );
    }
    if (!supportsStandard && data.password) {
      throw new BadRequestError(
        'password is only allowed when register_type includes STANDARD'
      );
    }
    if (supportsSso && !data.email) {
      throw new BadRequestError('email is required when register_type is SSO');
    }
    return true;
  });

export const ListUsersQuerySchema = z
  .object({
    search: z.string().trim().optional(),
    unitId: z.union([z.string(), z.array(z.string())]).optional(),
    deptId: z.union([z.string(), z.array(z.string())]).optional(),
    role: z.union([z.string(), z.array(z.string())]).optional(),
    isActive: z
      .preprocess((val) => {
        if (val === 'true' || val === true) return true;
        if (val === 'false' || val === false) return false;
        return undefined;
      }, z.boolean().optional())
      .optional(),
  })
  .transform((data) => {
    const parseList = (val: string | string[] | undefined): string[] => {
      if (!val) return [];
      if (typeof val === 'string') {
        return val
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      }
      return val.map((s) => s.trim()).filter(Boolean);
    };

    const unitId = parseList(data.unitId);
    const deptId = parseList(data.deptId);
    const roleInput = parseList(data.role);

    const validRoles = Object.values(UserRole) as string[];
    const role = roleInput.filter((r): r is UserRole => validRoles.includes(r));

    return {
      role,
      deptId,
      unitId,
      isActive: data.isActive,
      search: data.search,
    };
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
  role: z.enum(manageableUserRoles),
  dept_id: z.string().trim().min(1),
  unit_id: z.string().trim().optional(),
});

export const RemoveRoleSchema = z
  .object({
    user_id: z.uuid().optional(),
    role: z.enum(manageableUserRoles).optional(),
    dept_id: z.string().trim().optional(),
    unit_id: z.string().trim().optional(),
    role_id: z.uuid().optional(),
  })
  .refine((data) => {
    if (!(data.user_id && data.dept_id && data.role) && !data.role_id) {
      throw new BadRequestError('Missing required parameters');
    }
    return true;
  });

// ── Types ─────────────────────────────────────────────────────────────────────

export type CreateUserDto = z.infer<typeof CreateUserSchema>;
export type UpdateSupplyRoleDto = z.infer<typeof UpdateSupplyRoleSchema>;
export type AddRoleDto = z.infer<typeof AddRoleSchema>;
export type RemoveRoleDto = z.infer<typeof RemoveRoleSchema>;
