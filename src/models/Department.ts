import { z } from 'zod';
import { Department, UserRole } from '../../generated/prisma/client';

const CreateDepartmentSchema = z.object({
  name: z.string(),
  code: z.string(),
  allowed_role: z.array(z.enum(UserRole)).optional(),
});
export type CreateDepartmentDto = z.infer<typeof CreateDepartmentSchema>;

const updateDepartmentSchema = z.object({
  id: z.uuid(),
  name: z.string().optional(),
  code: z.string().optional(),
});
export type UpdateDepartmentDto = z.infer<typeof updateDepartmentSchema>;

export interface PaginatedDepartments {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  data: Array<Department>;
}
