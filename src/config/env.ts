import { existsSync } from 'node:fs';
import { config as loadDotEnv } from 'dotenv';
import { z } from 'zod';

if (existsSync('.env')) {
  loadDotEnv({ path: '.env' });
}

const optionalTrimmedString = (label: string) =>
  z.preprocess(
    (value) => {
      if (typeof value !== 'string') {
        return value;
      }

      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    },
    z.string().min(1, `${label} must not be empty`).optional()
  );

const optionalSecret = (label: string, minLength: number) =>
  z.preprocess(
    (value) => {
      if (typeof value !== 'string') {
        return value;
      }

      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    },
    z.string().min(minLength, `${label} must be at least ${minLength} characters`).optional()
  );

export type RuntimeRole = 'api' | 'worker' | 'scheduler';

export const resolveRuntimeRole = (
  argvEntry = process.argv[1] || '',
  explicitRole = process.env.PROCESS_ROLE
): RuntimeRole => {
  if (explicitRole === 'api' || explicitRole === 'worker' || explicitRole === 'scheduler') {
    return explicitRole;
  }

  const normalizedEntry = argvEntry.replace(/\\/g, '/').toLowerCase();

  if (normalizedEntry.includes('/worker.job.')) {
    return 'worker';
  }

  if (normalizedEntry.includes('/scheduler.job.')) {
    return 'scheduler';
  }

  return 'api';
};

const sharedOptionalSchema = z.object({
  CRON_SECRET: optionalSecret('CRON_SECRET', 16),
  CRON_LOCK_NAMESPACE: optionalTrimmedString('CRON_LOCK_NAMESPACE'),
  CRON_LOCK_TTL_MS: optionalTrimmedString('CRON_LOCK_TTL_MS'),
  CRON_WINDOW_TTL_MS: optionalTrimmedString('CRON_WINDOW_TTL_MS'),
  CRON_REQUEST_TIMEOUT_MS: optionalTrimmedString('CRON_REQUEST_TIMEOUT_MS'),
  R2_ACCOUNT_ID: optionalTrimmedString('R2_ACCOUNT_ID'),
  R2_ACCESS_KEY_ID: optionalTrimmedString('R2_ACCESS_KEY_ID'),
  R2_SECRET_ACCESS_KEY: optionalTrimmedString('R2_SECRET_ACCESS_KEY'),
  R2_BUCKET_NAME: optionalTrimmedString('R2_BUCKET_NAME'),
  RESEND_API_KEY: optionalTrimmedString('RESEND_API_KEY'),
  RESEND_FROM: optionalTrimmedString('RESEND_FROM'),
  REDIS_URL: optionalTrimmedString('REDIS_URL'),
  REDIS_PREFIX: optionalTrimmedString('REDIS_PREFIX'),
  REDIS_TLS_CA_PATH: optionalTrimmedString('REDIS_TLS_CA_PATH'),
  REDIS_TLS_SERVERNAME: optionalTrimmedString('REDIS_TLS_SERVERNAME'),
  APP_PUBLIC_URL: optionalTrimmedString('APP_PUBLIC_URL'),
  VENDOR_APP_PUBLIC_URL: optionalTrimmedString('VENDOR_APP_PUBLIC_URL'),
});

const apiEnvSchema = sharedOptionalSchema.extend({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  CRON_SECRET: z.string().min(16, 'CRON_SECRET must be at least 16 characters'),
  ...(process.env.NODE_ENV === 'production'
    ? { REDIS_URL: z.string().min(1, 'REDIS_URL is required in production') }
    : {}),
});

const workerEnvSchema = sharedOptionalSchema.extend({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
});

const schedulerEnvSchema = sharedOptionalSchema.extend({
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
});

export const runtimeRole = resolveRuntimeRole();

export const envSchema =
  runtimeRole === 'worker'
    ? workerEnvSchema
    : runtimeRole === 'scheduler'
      ? schedulerEnvSchema
      : apiEnvSchema;

if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error(`Invalid or missing environment variables for ${runtimeRole}:`);
    for (const [key, errors] of Object.entries(
      result.error.flatten().fieldErrors
    )) {
      console.error(`  - ${key}: ${errors?.join(', ')}`);
    }
    process.exit(1);
  }
}
