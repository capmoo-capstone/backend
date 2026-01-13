import { z } from 'zod';
import { User, UserRole } from '../../generated/prisma/client'; // Use the actual enum from Prisma

const CreateUserSchema = z.object({
  username: z.string().min(3).max(30),
  email: z.email('Invalid email address').nullish(),
  full_name: z.string().min(3).max(100),
  role: z.enum(UserRole).nullish(),
  unit_id: z.uuid().nullish(),
});
export type CreateUserDto = z.infer<typeof CreateUserSchema>;

const UserListResponse = z.object({
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
  totalPages: z.number(),
  data: z.array(
    z.object({
      id: z.string(),
      username: z.string(),
      email: z.email().nullish(),
      full_name: z.string(),
      role: z.enum(UserRole).nullish(),
      unit_id: z.uuid().nullish(),
    })
  ),
});
export type UserListResponse = z.infer<typeof UserListResponse>;
