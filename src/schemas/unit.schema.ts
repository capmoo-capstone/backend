import { z } from 'zod';
import { UnitResponsibleType } from '@prisma/client';

export const CreateUnitSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.array(z.enum(UnitResponsibleType)).optional(),
  dept_id: z.string(),
});

export const UpdateUnitSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  type: z.array(z.enum(UnitResponsibleType)).optional(),
  dept_id: z.string().optional(),
});

export const UpdateUnitUsersSchema = z.object({
  unit_id: z.string(),
  new_users: z.array(z.uuid()).default([]),
  remove_users: z.array(z.uuid()).default([]),
});

export const UpdateRepresentativeSchema = z.object({
  unit_id: z.string(),
  new_users: z.array(z.uuid()).max(1).default([]),
  remove_users: z.array(z.uuid()).max(1).default([]),
});

export type CreateUnitDto = z.infer<typeof CreateUnitSchema>;
export type UpdateUnitDto = z.infer<typeof UpdateUnitSchema>;
export type UpdateUnitUsersDto = z.infer<typeof UpdateUnitUsersSchema>;
export type UpdateRepresentativeDto = z.infer<
  typeof UpdateRepresentativeSchema
>;
