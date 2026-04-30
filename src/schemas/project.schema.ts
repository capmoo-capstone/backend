import { z } from 'zod';
import {
  ProcurementType,
  ProjectPhaseStatus,
  ProjectStatus,
  UrgentType,
} from '@prisma/client';

export const CreateProjectSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  budget: z.number(),
  budget_year: z.number().optional(),
  budget_plan_id: z.array(z.string()).optional(),
  pr_no: z.string().optional(),
  less_no: z.string().optional(),
  requesting_dept_id: z.string(),
  requesting_unit_id: z.string(),
  procurement_type: z.enum(ProcurementType),
  is_urgent: z.enum(UrgentType).default(UrgentType.NORMAL),
  expected_approval_date: z.coerce.date().optional(),
  expected_completion_procurement_date: z.coerce.date().optional(),
});

export const UpdateStatusProjectSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
});

export const UpdateStatusProjectsSchema = z.array(UpdateStatusProjectSchema);

export const AcceptProjectsSchema = z.object({
  id: z.array(z.uuid()),
});

export const CancelProjectSchema = z.object({
  id: z.uuid(),
  reason: z.string(),
});

export const RequestEditProjectSchema = z.object({
  id: z.uuid(),
  reason: z.string(),
});

export const UpdateProjectSchema = z.object({
  id: z.uuid(),
  updateData: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    budget: z.number().optional(),
    pr_no: z.string().optional(),
    po_no: z.string().optional(),
    less_no: z.string().optional(),
    asset_code: z.boolean().optional(),
    budget_plan_id: z.array(z.string()).optional(),
    vendor_name: z.string().optional(),
    vendor_email: z.string().optional(),
  }),
});

export const GetProjectsQueryByUnitSchema = z.object({
  unitId: z.string(),
});

export const ProjectFilterQuerySchema = z
  .object({
    search: z.string().optional(),
    title: z.string().optional(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    fiscalYear: z.union([z.string(), z.number()]).optional(),
    procurementType: z.array(z.enum(ProcurementType)).optional(),
    status: z.array(z.enum(ProjectStatus)).optional(),
    procurementStatus: z.array(z.enum(ProjectPhaseStatus)).optional(),
    contractStatus: z.array(z.enum(ProjectPhaseStatus)).optional(),
    urgentStatus: z.array(z.enum(UrgentType)).optional(),
    assignees: z.array(z.string()).optional(),
    departments: z.array(z.string()).optional(),
    units: z.array(z.string()).optional(),
    myTasks: z.boolean().optional(),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  })
  .optional();

export type CreateProjectDto = z.infer<typeof CreateProjectSchema>;
export type UpdateStatusProjectDto = z.infer<typeof UpdateStatusProjectSchema>;
export type UpdateStatusProjectsDto = z.infer<
  typeof UpdateStatusProjectsSchema
>;
export type AcceptProjectsDto = z.infer<typeof AcceptProjectsSchema>;
export type CancelProjectDto = z.infer<typeof CancelProjectSchema>;
export type RequestEditProjectDto = z.infer<typeof RequestEditProjectSchema>;
export type UpdateProjectDto = z.infer<typeof UpdateProjectSchema>;
export type GetProjectsQueryByUnitDto = z.infer<
  typeof GetProjectsQueryByUnitSchema
>;
export type ProjectFilterQuery = z.infer<typeof ProjectFilterQuerySchema>;
