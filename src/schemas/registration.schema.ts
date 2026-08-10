import { RegistrationStatus } from '@prisma/client';
import { z } from 'zod';

const RequiredText = z.string().trim().min(1).max(255);
const Email = z
  .email()
  .max(255)
  .transform((value) => value.toLowerCase());

export const CreateRegistrationRequestSchema = z.object({
  username: RequiredText,
  email: Email,
  full_name: RequiredText,
  dept_id: RequiredText,
  unit_id: RequiredText,
});

export const ListRegistrationRequestsQuerySchema = z.object({
  status: z.enum(RegistrationStatus).optional(),
});

export type CreateRegistrationRequestDto = z.infer<
  typeof CreateRegistrationRequestSchema
>;
export type ListRegistrationRequestsQueryDto = z.infer<
  typeof ListRegistrationRequestsQuerySchema
>;
