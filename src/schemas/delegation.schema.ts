import { z } from 'zod';

export const AddDelegationSchema = z.object({
  delegator_id: z.uuid(),
  delegatee_id: z.uuid(),
  start_date: z.coerce.date(),
  end_date: z.coerce.date().optional(),
});

export const GetActiveDelegationQuerySchema = z
  .object({
    role: z.enum(['HEAD_OF_DEPARTMENT', 'HEAD_OF_UNIT']),
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
    }
  );

export type AddDelegationDto = z.infer<typeof AddDelegationSchema>;
export type GetActiveDelegationQuery = z.infer<
  typeof GetActiveDelegationQuerySchema
>;
