import { z } from 'zod';

export const CreateHolidaySchema = z.object({
  date: z.string().date(),
  name: z.string().min(1),
});

export const UpdateHolidaySchema = z.object({
  date: z.string().date().optional(),
  name: z.string().min(1).optional(),
});

export const HolidayQuerySchema = z.object({
  year: z.coerce.number().int().positive().optional(),
});

export const CalculateTimelineSchema = z.object({
  unitResponsibilityType: z.enum([
    'LT100K',
    'INTERNAL',
    'LT500K',
    'MT500K',
    'SELECTION',
    'EBIDDING',
  ]),
  deliveryDate: z.string().datetime().optional(),
});

export type CreateHolidayDto = z.infer<typeof CreateHolidaySchema>;
export type UpdateHolidayDto = z.infer<typeof UpdateHolidaySchema>;
export type HolidayQueryDto = z.infer<typeof HolidayQuerySchema>;
export type CalculateTimelineDto = z.infer<typeof CalculateTimelineSchema>;

