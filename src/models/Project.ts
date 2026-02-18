import { z } from 'zod';
import {
  Project,
  ProjectPhaseStatus,
  ProcurementType,
  UrgentType,
} from '@prisma/client';
import { request } from 'node:http';

export interface PhaseStatusResult {
  status: ProjectPhaseStatus;
  step?: number;
}

export const CreateProjectSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  budget: z.number(),
  pr_no: z.string().optional(),
  less_no: z.string().optional(),
  requesting_dept_id: z.string(),
  requesting_unit_id: z.string(),
  procurement_type: z.enum(ProcurementType),
  is_urgent: z.enum(UrgentType).default(UrgentType.NORMAL),
  expected_approval_date: z.coerce.date().optional(),
});
export type CreateProjectDto = z.infer<typeof CreateProjectSchema>;

export interface PaginatedProjects {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  data: Array<Partial<Project>>;
}

export interface ProjectsListResponse {
  total: number;
  data: Array<Partial<Project>>;
}

export const UpdateStatusProjectSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
});
export type UpdateStatusProjectDto = z.infer<typeof UpdateStatusProjectSchema>;

export const UpdateStatusProjectsSchema = z.array(UpdateStatusProjectSchema);
export type UpdateStatusProjectsDto = z.infer<
  typeof UpdateStatusProjectsSchema
>;

export const AcceptProjectsSchema = z.object({
  id: z.array(z.uuid()),
});
export type AcceptProjectsDto = z.infer<typeof AcceptProjectsSchema>;

export const CancelProjectSchema = z.object({
  id: z.uuid(),
  reason: z.string(),
});
export type CancelProjectDto = z.infer<typeof CancelProjectSchema>;

export const UpdateProjectSchema = z.object({
  id: z.uuid(),
  updateData: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    budget: z.number().optional(),
    pr_no: z.string().optional(),
    po_no: z.string().optional(),
    less_no: z.string().optional(),
    requesting_unit_id: z.string().optional(),
    procurement_type: z.enum(ProcurementType).optional(),
    is_urgent: z.enum(UrgentType).optional(),
    expected_approval_date: z.coerce.date().optional(),
    vendor_name: z.string().optional(),
    vendor_email: z.string().optional(),
    vendor_tax_id: z.string().optional(),
  }),
});
export type UpdateProjectDto = z.infer<typeof UpdateProjectSchema>;
