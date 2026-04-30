import { z } from 'zod';
import { SubmissionType, UnitResponsibleType } from '@prisma/client';

export const CreateStaffSubmissionSchema = z.object({
  project_id: z.uuid(),
  type: z.literal(SubmissionType.STAFF),
  step_order: z.number(),
  workflow_type: z.enum(UnitResponsibleType),
  required_approval: z.boolean(),
  required_updating: z.boolean(),
  meta_data: z
    .array(
      z.object({
        field_key: z.string().optional(),
        value: z
          .union([z.string(), z.boolean(), z.number()])
          .optional()
          .nullable(),
      })
    )
    .default([]),
  files: z
    .array(
      z.object({
        field_key: z.string(),
        file_name: z.string(),
        file_path: z.string(),
      })
    )
    .optional(),
});

export const CreateVendorSubmissionSchema = z.object({
  type: z.literal(SubmissionType.VENDOR),
  workflow_type: z.literal(UnitResponsibleType.CONTRACT),
  step_order: z.number().default(2),
  po_no: z.string(),
  installment: z.number().optional(),
  files: z.array(
    z.object({
      field_key: z.string(),
      file_name: z.string(),
      file_path: z.string(),
    })
  ),
});

export const VendorSubmissionFilterQuerySchema = z
  .object({
    search: z.string().optional(),
    dateFrom: z.coerce.date().optional(),
    dateTo: z.coerce.date().optional(),
  })
  .optional();

export const ApproveSubmissionSchema = z.object({
  id: z.uuid(),
  required_signature: z.boolean(),
});

export const CompleteSubmissionSchema = z.object({
  id: z.uuid(),
  required_updating: z.boolean(),
});

export const UpdateProjectForSubmissionSchema = z.object({
  pr_no: z.string().optional(),
  po_no: z.string().optional(),
  less_no: z.string().optional(),
  contract_no: z.string().optional(),
  migo_103_no: z.string().optional(),
  migo_105_no: z.string().optional(),
  asset_code: z.coerce.boolean().optional().nullable(),
  vendor_name: z.string().optional(),
  vendor_email: z.string().optional(),
});

export const RejectSubmissionSchema = z.object({
  id: z.uuid(),
  comment: z.string(),
});

export type CreateStaffSubmissionDto = z.infer<
  typeof CreateStaffSubmissionSchema
>;
export type CreateVendorSubmissionDto = z.infer<
  typeof CreateVendorSubmissionSchema
>;
export type ApproveSubmissionDto = z.infer<typeof ApproveSubmissionSchema>;
export type CompleteSubmissionDto = z.infer<typeof CompleteSubmissionSchema>;
export type UpdateProjectForSubmissionDto = z.infer<
  typeof UpdateProjectForSubmissionSchema
>;
export type RejectSubmissionDto = z.infer<typeof RejectSubmissionSchema>;
export type VendorSubmissionFilterQuery = z.infer<
  typeof VendorSubmissionFilterQuerySchema
>;
