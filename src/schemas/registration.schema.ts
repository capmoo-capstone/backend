import { RegistrationStatus } from '@prisma/client';
import { z } from 'zod';

const RequiredText = z.string().trim().min(1).max(255);
const Email = z
  .email()
  .max(255)
  .transform((value) => value.toLowerCase());
const UnitIds = z
  .array(RequiredText)
  .min(1, 'At least one unit is required')
  .refine((unitIds) => new Set(unitIds).size === unitIds.length, {
    message: 'Unit IDs must be unique',
  });

export const CreateRegistrationRequestSchema = z.object({
  username: RequiredText,
  email: Email,
  full_name: RequiredText,
  dept_id: RequiredText,
  unit_id: UnitIds,
});

export const ListRegistrationRequestsQuerySchema = z.object({
  status: z.enum(RegistrationStatus).optional(),
});

export type CreateRegistrationRequestDto = z.infer<
  typeof CreateRegistrationRequestSchema
>;
export type ListRegistrationRequestsQuery = z.infer<
  typeof ListRegistrationRequestsQuerySchema
>;
