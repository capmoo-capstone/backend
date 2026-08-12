import { z } from 'zod';
import { toBool, toStringArray } from '../lib/helper';

export const CreateDepartmentSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const UpdateDepartmentSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
});

export const ListDepartmentsQuerySchema = z
  .object({
    exclude_dept: z.union([z.string(), z.array(z.string())]).optional(),
    excludeDept: z.union([z.string(), z.array(z.string())]).optional(),
    withUnit: z.union([z.boolean(), z.string()]).optional(),
  })
  .transform((query) => ({
    excludeDeptIds: query?.exclude_dept
      ? [
          ...toStringArray(query.exclude_dept),
          ...toStringArray(query.excludeDept),
        ]
      : undefined,
    withUnit: toBool(query?.withUnit),
  }))

export type CreateDepartmentDto = z.infer<typeof CreateDepartmentSchema>;
export type UpdateDepartmentDto = z.infer<typeof UpdateDepartmentSchema>;
export type ListDepartmentsQuery = z.infer<
  typeof ListDepartmentsQuerySchema
>;
