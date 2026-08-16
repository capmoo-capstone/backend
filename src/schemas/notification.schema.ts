import { z } from 'zod';

export const ListNotificationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.uuid().optional(),
  needs_action: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((value) => value === true || value === 'true')
    .optional(),
});

export const MarkNotificationReadSchema = z.object({
  id: z.uuid(),
});

export const NotificationStreamQuerySchema = z.object({
  token: z.string().min(1),
});

export type ListNotificationsQueryDto = z.infer<
  typeof ListNotificationsQuerySchema
>;
export type MarkNotificationReadDto = z.infer<
  typeof MarkNotificationReadSchema
>;
export type NotificationStreamQueryDto = z.infer<
  typeof NotificationStreamQuerySchema
>;
