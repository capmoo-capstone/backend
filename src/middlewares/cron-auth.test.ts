import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { protectCron } from './cron-auth';

const invoke = (authorization?: string) => {
  const next = vi.fn();
  protectCron({ headers: { authorization } } as any, {} as any, next);
  return next;
};

const originalCronSecret = process.env.CRON_SECRET;

beforeEach(() => {
  process.env.CRON_SECRET = 'unit-test-cron-secret';
});

afterEach(() => {
  if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalCronSecret;
});

describe('protectCron', () => {
  it('accepts a valid bearer token', () => {
    expect(invoke('Bearer unit-test-cron-secret')).toHaveBeenCalledWith();
  });

  it('rejects a missing header', () => {
    expect(invoke()).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401 })
    );
  });

  it('rejects a malformed bearer header', () => {
    expect(invoke('Basic unit-test-cron-secret')).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401 })
    );
  });

  it('rejects an invalid token', () => {
    expect(invoke('Bearer incorrect-secret')).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401 })
    );
  });

  it('returns service unavailable when no secret is configured', () => {
    delete process.env.CRON_SECRET;
    expect(invoke('Bearer any-secret')).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 503 })
    );
  });
});
