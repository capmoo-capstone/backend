import { z } from 'zod';
import { Department } from '@prisma/client';

const CreateDepartmentSchema = z.object({
  id: z.string(),
  name: z.string(),
});
export type CreateDepartmentDto = z.infer<typeof CreateDepartmentSchema>;

const updateDepartmentSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
});
export type UpdateDepartmentDto = z.infer<typeof updateDepartmentSchema>;

export interface PaginatedDepartments {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  data: Array<Department>;
}
