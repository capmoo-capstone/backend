import { z } from 'zod';

// Define the validation schema
export const CreateUserSchema = z.object({
  email: z.email(),
  name: z.string().optional(),
});

// Extract the TypeScript type from the schema
export type CreateUserInput = z.infer<typeof CreateUserSchema>;
