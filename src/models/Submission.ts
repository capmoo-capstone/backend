import { z } from 'zod';
import { SubmissionType } from '../../generated/prisma/enums';

export const CreateSubmissionSchema = z.object({
  project_id: z.uuid(),
  type: z.enum(SubmissionType),
  step_id: z.uuid().optional(),
  po_no: z.string().optional(),
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

export const StatusSubmissionSchema = z.object({
  id: z.uuid(),
  project_id: z.uuid(),
  step_id: z.uuid(),
});
export type StatusSubmissionDto = z.infer<typeof StatusSubmissionSchema>;

export const RejectSubmissionSchema = z.object({
  id: z.uuid(),
  comment: z.string(),
});
export type RejectSubmissionDto = z.infer<typeof RejectSubmissionSchema>;
