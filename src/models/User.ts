import { z } from 'zod';
import { User, Role, UnitResponsibleType } from '@prisma/client';

export const RegisterUserSchema = z.object({
  username: z.string(),
  full_name: z.string(),
  email: z.email().optional(),
  role: z.enum(Role).default(Role.GUEST),
  dept_id: z.string(),
  unit_id: z.string().optional(),
});
export type RegisterUserDto = z.infer<typeof RegisterUserSchema>;

export const UpdateUserUnitSchema = z.object({
  unit_id: z.uuid(),
  users: z.array(
    z.object({
      id: z.uuid(),
      role: z.enum(Role).default(Role.GENERAL_STAFF),
    })
  ),
});
export type UpdateUserUnitDto = z.infer<typeof UpdateUserUnitSchema>;

const UpdateRepresentativeUnitSchema = z.object({
  unit_id: z.uuid(),
  user_id: z.uuid(),
});
export type UpdateRepresentativeUnitDto = z.infer<
  typeof UpdateRepresentativeUnitSchema
>;

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
