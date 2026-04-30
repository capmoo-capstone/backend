import { z } from 'zod';
import { UnitResponsibleType } from '@prisma/client';

const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

export const PresignUploadSchema = z.object({
  projectId: z.uuid(),
  workflowType: z.enum(UnitResponsibleType),
  stepOrder: z.number().int().min(1),
  fileName: z.string().min(1),
  contentType: z.enum(ALLOWED_TYPES),
});

export const PresignDownloadSchema = z.object({
  key: z.string().min(1),
});

export type PresignUploadDto = z.infer<typeof PresignUploadSchema>;
export type PresignDownloadDto = z.infer<typeof PresignDownloadSchema>;
