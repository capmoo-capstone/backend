import { z } from 'zod';

export const ListNotificationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
  needs_action: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((value) => value === true || value === 'true')
    .optional(),
});

export const MarkNotificationReadSchema = z.object({
  id: z.uuid(),
});

export type ListNotificationsQueryDto = z.infer<
  typeof ListNotificationsQuerySchema
>;
export type MarkNotificationReadDto = z.infer<
  typeof MarkNotificationReadSchema
>;
