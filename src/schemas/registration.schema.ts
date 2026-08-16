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

export const ListRegistrationRequestsQuerySchema = z
  .object({
    search: z.string().trim().optional(),
    unitId: z.union([z.string(), z.array(z.string())]).optional(),
    deptId: z.union([z.string(), z.array(z.string())]).optional(),
  })
  .transform((data) => {
    const parseList = (val: string | string[] | undefined): string[] => {
      if (!val) return [];
      if (typeof val === 'string') {
        return val
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      }
      return val.map((s) => s.trim()).filter(Boolean);
    };

    const unitId = parseList(data.unitId);
    const deptId = parseList(data.deptId);

    return {
      deptId,
      unitId,
      search: data.search,
    };
  });

export type CreateRegistrationRequestDto = z.infer<
  typeof CreateRegistrationRequestSchema
>;
export type ListRegistrationRequestsQuery = z.infer<
  typeof ListRegistrationRequestsQuerySchema
>;
