import { z } from 'zod';

export const AddDelegationSchema = z.object({
  delegator_id: z.uuid(),
  delegatee_id: z.uuid(),
  start_date: z.coerce.date(),
  end_date: z.coerce.date().optional(),
});
export type AddDelegationDto = z.infer<typeof AddDelegationSchema>;
