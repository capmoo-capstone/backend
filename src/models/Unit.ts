import { z } from 'zod';
import { Unit, UnitResponsibleType } from '../../generated/prisma/client';

const CreateUnitSchema = z.object({
  name: z.string(),
  type: z.array(z.enum(UnitResponsibleType)),
  dept_id: z.uuid(),
});
export type CreateUnitDto = z.infer<typeof CreateUnitSchema>;

const updateUnitSchema = z.object({
  id: z.uuid(),
  name: z.string().optional(),
  type: z.array(z.enum(UnitResponsibleType)).optional(),
  dept_id: z.uuid().optional(),
});
export type UpdateUnitDto = z.infer<typeof updateUnitSchema>;

export interface PaginatedUnits {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  data: Array<Unit>;
}
