import { z } from 'zod';
import { SubmissionType, UnitResponsibleType } from '@prisma/client';

export const CreateStaffSubmissionSchema = z.object({
  project_id: z.uuid(),
  type: z.literal(SubmissionType.STAFF),
  step_order: z.number(),
  workflow_type: z.enum(UnitResponsibleType),
  require_approval: z.boolean(),
  meta_data: z
    .array(
      z.object({
        field_key: z.string().optional(),
        value: z.string().optional(),
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
  project_id: z.uuid().optional(),
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
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
  })
  .optional();

export const ApproveSubmissionSchema = z.object({
  id: z.uuid(),
  required_signature: z.boolean(),
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
export type RejectSubmissionDto = z.infer<typeof RejectSubmissionSchema>;
export type VendorSubmissionFilterQuery = z.infer<
  typeof VendorSubmissionFilterQuerySchema
>;
