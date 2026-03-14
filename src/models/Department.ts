import { z } from 'zod';
import { Department } from '@prisma/client';

export const CreateDepartmentSchema = z.object({
  id: z.string(),
  name: z.string(),
});
export type CreateDepartmentDto = z.infer<typeof CreateDepartmentSchema>;

export const UpdateDepartmentSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
});
export type UpdateDepartmentDto = z.infer<typeof UpdateDepartmentSchema>;

export interface DepartmentsListResponse {
  total: number;
  data: Array<Department>;
}
