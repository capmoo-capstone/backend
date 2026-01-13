import { z } from 'zod';
import { ProcurementType, ProjectStatus } from '../../generated/prisma/enums';

const ProjectResponse = z.object({
  id: z.string(),
  status: z.enum(ProjectStatus),
  receive_no: z.string(),
  title: z.string(),
  budget: z.number(),
  pr_no: z.string().nullish(),
  po_no: z.string().nullish(),
  request_unit_id: z.string().nullish(),
  procurement_type: z.enum(ProcurementType),
  current_templates_id: z.string(),
  current_step_id: z.string().nullish(),
  assignee_procurement_id: z.string().nullish(),
  assignee_contract_id: z.string().nullish(),
  contract_no: z.string().nullish(),
  migo_no: z.string().nullish(),
  vendor_name: z.string().nullish(),
  vendor_tax_id: z.string().nullish(),
  vendor_email: z.string().nullish(),
  is_urgent: z.boolean(),
  created_by: z.string(),
  created_at: z.date(),
  updated_at: z.date(),
});
export type ProjectResponse = z.infer<typeof ProjectResponse>;

const ProjectListResponse = z.object({
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
  totalPages: z.number(),
  data: z.array(ProjectResponse),
});
export type ProjectListResponse = z.infer<typeof ProjectListResponse>;

const CreateProjectSchema = z.object({
  id: z.string(),
  status: z.enum(ProjectStatus),
  receive_no: z.string(),
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
  is_urgent: z.boolean(),
  created_by: z.string(),
  created_at: z.date(),
  updated_at: z.date(),
});
export type CreateProjectDto = z.infer<typeof CreateProjectSchema>;
