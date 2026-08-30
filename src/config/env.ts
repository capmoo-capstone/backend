import { z } from 'zod';

export const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  CRON_SECRET: z.string().min(16, 'CRON_SECRET must be at least 16 characters'),
  R2_ACCOUNT_ID: z.string().min(1, 'R2_ACCOUNT_ID is required'),
  R2_ACCESS_KEY_ID: z.string().min(1, 'R2_ACCESS_KEY_ID is required'),
  R2_SECRET_ACCESS_KEY: z.string().min(1, 'R2_SECRET_ACCESS_KEY is required'),
  R2_BUCKET_NAME: z.string().min(1, 'R2_BUCKET_NAME is required'),
});

// Vitest intentionally uses short dummy secrets in its shared setup.
if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid or missing environment variables:');
    for (const [key, errors] of Object.entries(
      result.error.flatten().fieldErrors
    )) {
      console.error(`  - ${key}: ${errors?.join(', ')}`);
    }
    process.exit(1);
  }
}
