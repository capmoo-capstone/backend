import { z } from 'zod';
import { ProcurementType, ProjectStatus } from '../../generated/prisma/enums';
import { Project } from '../../generated/prisma/client';

const CreateProjectSchema = z.object({
  id: z.string(),
  status: z.enum(ProjectStatus),
  title: z.string(),
  budget: z.number(),
  pr_no: z.string().optional(),
  po_no: z.string().optional(),
  request_unit_id: z.string().optional(),
  procurement_type: z.enum(ProcurementType),
  current_templates_id: z.string(),
  contract_no: z.string().optional(),
  migo_no: z.string().optional(),
  vendor_name: z.string().optional(),
  vendor_tax_id: z.string().optional(),
  vendor_email: z.string().optional(),
  is_urgent: z.boolean().default(false),
  expected_approval_date: z.date().optional(),
  created_by: z.string(),
  created_at: z.date(),
  update_by: z.string().optional(),
  updated_at: z.date(),
});
export type CreateProjectDto = z.infer<typeof CreateProjectSchema>;

export interface PaginatedProjects {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  data: Array<Project>;
}

const updateStatusProjectSchema = z.object({
  id: z.uuid(),
  userId: z.string(),
});
export type UpdateStatusProjectDto = z.infer<typeof updateStatusProjectSchema>;

const updateStatusProjectsSchema = z.array(updateStatusProjectSchema);
export type UpdateStatusProjectsDto = z.infer<
  typeof updateStatusProjectsSchema
>;

const cancelProjectSchema = z.object({
  id: z.uuid(),
  reason: z.string(),
});
export type CancelProjectDto = z.infer<typeof cancelProjectSchema>;

const updateProjectSchema = z.object({
  id: z.string(),
  updateData: z.object(CreateProjectSchema.partial().shape),
});
export type UpdateProjectDto = z.infer<typeof updateProjectSchema>;
