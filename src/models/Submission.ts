import { z } from 'zod';
import {
  ProcurementType,
  SubmissionType,
  UnitResponsibleType,
} from '../../generated/prisma/enums';

export const CreateSubmissionSchema = z.object({
  project_id: z.uuid(),
  type: z.enum(SubmissionType),
  step_order: z.number(),
  workflow_type: z.enum(ProcurementType).and(z.enum(UnitResponsibleType)),
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
export type CreateSubmissionDto = z.infer<typeof CreateSubmissionSchema>;

export const ApproveSubmissionSchema = z.object({
  id: z.uuid(),
  required_signature: z.boolean(),
});
export type ApproveSubmissionDto = z.infer<typeof ApproveSubmissionSchema>;

export const RejectSubmissionSchema = z.object({
  id: z.uuid(),
  comment: z.string(),
});
export type RejectSubmissionDto = z.infer<typeof RejectSubmissionSchema>;
