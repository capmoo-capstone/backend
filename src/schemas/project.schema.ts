import {
  ProcurementType,
  ProjectInstallmentStatus,
  ProjectStatus,
  UrgentType,
} from '@prisma/client';
import { z } from 'zod';
import { BangkokDateTimeSchema } from '../lib/date';

export const OwnProjectTabEnum = z.enum([
  'all',
  'waiting_accept',
  'need_action',
  'rejected',
  'waiting_approval',
  'waiting_cancel',
  'waiting_proposal',
  'waiting_signature',
  'waiting_others',
  'urgent',
  'waiting_finance_export',
  'waiting_close_project',
  'waiting_edit',
  'completed',
]);

export const GetOwnProjectsQuerySchema = z.object({
  tab: OwnProjectTabEnum.default('all'),
  search: z.string().trim().optional(),
  dateFrom: BangkokDateTimeSchema.optional(),
  dateTo: BangkokDateTimeSchema.optional(),
});

export const CreateProjectSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  budget: z.number(),
  budget_year: z.coerce.number().int().optional(),
  budget_plan_id: z.array(z.string()).optional(),
  pr_no: z.string().optional(),
  less_no: z.string().optional(),
  po_no: z.string().optional(),
  requesting_dept_id: z.string(),
  requesting_unit_id: z.string(),
  procurement_type: z.enum(ProcurementType),
  is_urgent: z.enum(UrgentType).default(UrgentType.NORMAL),
  expected_approval_date: BangkokDateTimeSchema.optional(),
  expected_completion_procurement_date: BangkokDateTimeSchema.optional(),
  installment_rounds: z.coerce.number().int().min(1).default(1),
});

export const UpdateStatusProjectSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
});

export const UpdateStatusProjectsSchema = z.array(UpdateStatusProjectSchema);

export const AcceptProjectsSchema = z.object({
  id: z
    .array(z.uuid())
    .min(1)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'Duplicate ids are not allowed',
      path: ['id'],
    }),
});

export const CompleteProcurementPhaseSchema = z.object({
  id: z.uuid(),
  continue_unit_proc: z.boolean().default(false),
  assignee_contract: z.uuid().optional(),
});

export const CompleteInstallmentSchema = z
  .object({
    id: z.uuid(),
    installment_no: z.coerce.number().int(),
  })
  .refine((data) => data.installment_no > 0, {
    message: 'Installment No. must be greater than 0',
    path: ['installment_no'],
  });

export const CancelProjectSchema = z.object({
  id: z.uuid(),
  reason: z.string(),
});

export const RequestEditInstallmentSchema = z.object({
  id: z.uuid(),
  reason: z.string(),
});

export const GetNewContractNumberSchema = z.object({
  type: z.enum(['CU', 'SP', 'PSY', 'NUR', 'HS']),
  budget_year: z.coerce.number().int(),
});

export const CancelContractNumberSchema = z.object({
  contractId: z.uuid(),
  reason: z.string(),
});

export const ExportInstallmentSchema = z.object({
  id: z
    .array(z.uuid())
    .min(1)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'Duplicate ids are not allowed',
      path: ['id'],
    }),
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
    migo_103_no: z.string().optional(),
    migo_105_no: z.string().optional(),
    asset_code: z.boolean().optional(),
    budget_plan_id: z.array(z.string()).optional(),
    vendor_name: z.string().optional(),
    vendor_email: z.string().optional(),
    installment_rounds: z.coerce.number().int().min(1).optional(),
  }),
});

export const GetProjectsQueryByUnitSchema = z.object({
  unitId: z.string(),
});

export const ProjectFilterQuerySchema = z
  .object({
    search: z.string().optional(),
    title: z.string().optional(),
    dateFrom: BangkokDateTimeSchema.optional(),
    dateTo: BangkokDateTimeSchema.optional(),
    fiscalYear: z.union([z.string(), z.coerce.number().int()]).optional(),
    procurementType: z.array(z.enum(ProcurementType)).optional(),
    status: z.array(z.enum(ProjectStatus)).optional(),
    procurementStatus: z.array(z.enum(ProjectStatus)).optional(),
    contractStatus: z.array(z.enum(ProjectStatus)).optional(),
    urgentStatus: z.array(z.enum(UrgentType)).optional(),
    assignees: z.array(z.string()).optional(),
    departments: z.array(z.string()).optional(),
    units: z.array(z.string()).optional(),
    myTasks: z.boolean().optional(),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  })
  .optional();

export const GetAssignedProjectsQuerySchema = z.object({
  dateFrom: BangkokDateTimeSchema.optional(),
  dateTo: BangkokDateTimeSchema.optional(),
});

export const GetInstallmentsQuerySchema = z.object({
  search: z.string().trim().optional(),
  title: z.string().trim().optional(),
  status: z.array(z.enum(ProjectInstallmentStatus)).optional(),
  installment: z.coerce.number().int().optional(),
  assignees: z.array(z.string()).optional(),
  procurementType: z.array(z.enum(ProcurementType)).optional(),
  departments: z.array(z.string()).optional(),
});

export type CreateProjectDto = z.infer<typeof CreateProjectSchema>;
export type UpdateStatusProjectDto = z.infer<typeof UpdateStatusProjectSchema>;
export type UpdateStatusProjectsDto = z.infer<
  typeof UpdateStatusProjectsSchema
>;
export type AcceptProjectsDto = z.infer<typeof AcceptProjectsSchema>;
export type CompleteProcurementPhaseDto = z.infer<
  typeof CompleteProcurementPhaseSchema
>;
export type CompleteInstallmentDto = z.infer<typeof CompleteInstallmentSchema>;
export type CancelProjectDto = z.infer<typeof CancelProjectSchema>;
export type RequestEditInstallmentDto = z.infer<
  typeof RequestEditInstallmentSchema
>;
export type UpdateProjectDto = z.infer<typeof UpdateProjectSchema>;
export type ExportInstallmentDto = z.infer<typeof ExportInstallmentSchema>;
export type GetProjectsQueryByUnitDto = z.infer<
  typeof GetProjectsQueryByUnitSchema
>;
export type ProjectFilterQuery = z.infer<typeof ProjectFilterQuerySchema>;
export type GetAssignedProjectsQuery = z.infer<
  typeof GetAssignedProjectsQuerySchema
>;
export type OwnProjectTab = z.infer<typeof OwnProjectTabEnum>;
export type GetOwnProjectsQuery = z.infer<typeof GetOwnProjectsQuerySchema>;
export type GetInstallmentsQuery = z.infer<typeof GetInstallmentsQuerySchema>;
