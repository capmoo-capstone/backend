import { describe, expect, it, vi } from 'vitest';
import { protectCron } from './cron-auth';

describe('protectCron', () => {
  it('accepts a matching bearer token', () => {
    const next = vi.fn();

    protectCron(
      {
        headers: {
          authorization: `Bearer ${process.env.CRON_SECRET}`,
        },
      } as any,
      {} as any,
      next
    );

    expect(next).toHaveBeenCalledWith();
  });

  it('rejects a request without authorization', () => {
    const next = vi.fn();

    protectCron({ headers: {} } as any, {} as any, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
        message: 'Authorization header missing',
      })
    );
  });

  it('rejects a request with the wrong bearer token', () => {
    const next = vi.fn();

    protectCron(
      {
        headers: {
          authorization: 'Bearer wrong-secret',
        },
      } as any,
      {} as any,
      next
    );

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
        message: 'Invalid cron secret',
      })
    );
  });
});
