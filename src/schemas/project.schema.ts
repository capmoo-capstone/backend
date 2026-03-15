import { z } from 'zod';
import { ProcurementType, UrgentType } from '@prisma/client';

export const CreateProjectSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  budget: z.number(),
  budget_plan_id: z.array(z.string()).optional(),
  pr_no: z.string().optional(),
  less_no: z.string().optional(),
  requesting_dept_id: z.string(),
  requesting_unit_id: z.string(),
  procurement_type: z.enum(ProcurementType),
  is_urgent: z.enum(UrgentType).default(UrgentType.NORMAL),
  expected_approval_date: z.coerce.date().optional(),
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

export type CreateProjectDto = z.infer<typeof CreateProjectSchema>;
export type UpdateStatusProjectDto = z.infer<typeof UpdateStatusProjectSchema>;
export type UpdateStatusProjectsDto = z.infer<
  typeof UpdateStatusProjectsSchema
>;
export type AcceptProjectsDto = z.infer<typeof AcceptProjectsSchema>;
export type CancelProjectDto = z.infer<typeof CancelProjectSchema>;
export type UpdateProjectDto = z.infer<typeof UpdateProjectSchema>;
