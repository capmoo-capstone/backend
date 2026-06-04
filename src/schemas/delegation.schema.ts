import { z } from 'zod';
import { UserRole } from '@prisma/client';

const delegableRoles = [
  UserRole.HEAD_OF_DEPARTMENT,
  UserRole.HEAD_OF_UNIT,
] as const;

export const AddDelegationSchema = z
  .object({
    delegator_id: z.uuid(),
    delegatee_id: z.uuid(),
    role: z.enum(delegableRoles),
    unit_id: z.string().optional(),
    start_date: z.coerce.date(),
    end_date: z.coerce.date().optional(),
  })
  .refine((data) => data.role !== UserRole.HEAD_OF_UNIT || !!data.unit_id, {
    message: 'unit_id is required when role is HEAD_OF_UNIT',
    path: ['unit_id'],
  })
  .refine(
    (data) =>
      data.role !== UserRole.HEAD_OF_DEPARTMENT || data.unit_id === undefined,
    {
      message: 'unit_id is not allowed when role is HEAD_OF_DEPARTMENT',
      path: ['unit_id'],
    }
  );

export const GetActiveDelegationQuerySchema = z
  .object({
    role: z.enum(delegableRoles),
    unitId: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.role === 'HEAD_OF_UNIT') {
        return !!data.unitId;
      }
      return true;
    },
    {
      message: 'unitId is required when role is HEAD_OF_UNIT',
      path: ['unitId'],
    }
  );

export type AddDelegationDto = z.infer<typeof AddDelegationSchema>;
export type GetActiveDelegationQuery = z.infer<
  typeof GetActiveDelegationQuerySchema
>;
