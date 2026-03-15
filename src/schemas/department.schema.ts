import { z } from 'zod';

export const CreateDepartmentSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const UpdateDepartmentSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
});

export type CreateDepartmentDto = z.infer<typeof CreateDepartmentSchema>;
export type UpdateDepartmentDto = z.infer<typeof UpdateDepartmentSchema>;
