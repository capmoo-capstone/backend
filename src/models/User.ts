import { z } from 'zod';
import { User, UserRole } from '@prisma/client';

export const RegisterUserSchema = z.object({
  username: z.string(),
  full_name: z.string(),
  email: z.email().optional(),
  role: z.enum(UserRole).default(UserRole.GUEST),
  dept_id: z.string(),
  unit_id: z.string().optional(),
});
export type RegisterUserDto = z.infer<typeof RegisterUserSchema>;

export const UpdateUserUnitSchema = z.object({
  unit_id: z.string(),
  users: z.array(z.uuid()),
});
export type UpdateUserUnitDto = z.infer<typeof UpdateUserUnitSchema>;

export const UpdateRepresentativeUnitSchema = z.object({
  id: z.uuid(),
  unit_id: z.string(),
});
export type UpdateRepresentativeUnitDto = z.infer<
  typeof UpdateRepresentativeUnitSchema
>;

export const UpdateRoleSchema = z.object({
  role: z.enum(UserRole),
  dept_id: z.string(),
  unit_id: z.string().optional(),
});
export type UpdateRoleDto = z.infer<typeof UpdateRoleSchema>;

export interface UsersListFilters {
  unitId?: string;
  deptId?: string;
}

export interface UsersListResponse {
  id: string;
  entity_type: string;
  name: string;
  total: number;
  data: Array<Partial<User>>;
}
