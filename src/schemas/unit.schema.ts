import { z } from 'zod';
import { UnitResponsibleType } from '@prisma/client';

export const CreateUnitSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.array(z.enum(UnitResponsibleType)).optional(),
  dept_id: z.uuid(),
});

export const UpdateUnitSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  type: z.array(z.enum(UnitResponsibleType)).optional(),
  dept_id: z.uuid().optional(),
});

export type CreateUnitDto = z.infer<typeof CreateUnitSchema>;
export type UpdateUnitDto = z.infer<typeof UpdateUnitSchema>;
