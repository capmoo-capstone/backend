import { afterEach, beforeEach, vi } from 'vitest';

process.env.DATABASE_URL ??= 'postgresql://unit-test/unit-test';
process.env.JWT_SECRET ??= 'unit-test-secret';
process.env.R2_ACCOUNT_ID ??= 'unit-test-account';
process.env.R2_ACCESS_KEY_ID ??= 'unit-test-access-key';
process.env.R2_SECRET_ACCESS_KEY ??= 'unit-test-secret-key';
process.env.R2_BUCKET_NAME ??= 'unit-test-bucket';

vi.mock('../config/prisma', async () => {
  const { prismaMock } = await import('./prisma-mock');
  return { prisma: prismaMock };
});

beforeEach(async () => {
  const { resetPrismaMock } = await import('./prisma-mock');
  resetPrismaMock();
});

afterEach(() => {
  vi.useRealTimers();
});
