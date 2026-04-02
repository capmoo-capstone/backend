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

export const UpdateUserUnitSchema = z.object({
  unit_id: z.string(),
  users: z.array(z.uuid()),
});

export const UpdateRepresentativeUnitSchema = z.object({
  id: z.uuid(),
  unit_id: z.string(),
});

export const UpdateRoleSchema = z.object({
  id: z.uuid(),
  role: z.enum(UserRole),
  dept_id: z.string(),
  unit_id: z.string().optional(),
});

export type RegisterUserDto = z.infer<typeof RegisterUserSchema>;
export type UpdateUserUnitDto = z.infer<typeof UpdateUserUnitSchema>;
export type UpdateRepresentativeUnitDto = z.infer<
  typeof UpdateRepresentativeUnitSchema
>;
export type UpdateRoleDto = z.infer<typeof UpdateRoleSchema>;
