import { z } from 'zod';
import { ProcurementType, ProjectStatus } from '../../generated/prisma/enums';
import { Project } from '../../generated/prisma/client';

const CreateProjectSchema = z.object({
  id: z.string(),
  status: z.enum(ProjectStatus),
  title: z.string(),
  budget: z.number(),
  pr_no: z.string().nullish(),
  po_no: z.string().nullish(),
  request_unit_id: z.string().nullish(),
  procurement_type: z.enum(ProcurementType),
  current_templates_id: z.string(),
  contract_no: z.string().nullish(),
  migo_no: z.string().nullish(),
  vendor_name: z.string().nullish(),
  vendor_tax_id: z.string().nullish(),
  vendor_email: z.string().nullish(),
  is_urgent: z.boolean().default(false),
  created_by: z.string(),
  created_at: z.date(),
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
  projectType: z.enum(['procurement', 'contract']),
  projectId: z.string(),
  userId: z.string(),
});
export type UpdateStatusProjectDto = z.infer<typeof updateStatusProjectSchema>;
