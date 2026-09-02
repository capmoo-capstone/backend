import { afterEach, describe, expect, it, vi } from 'vitest';

const { clients, values } = vi.hoisted(() => ({ clients: [] as Array<any>, values: new Map<string, string>() }));

vi.mock('ioredis', () => ({
  default: class FakeRedis {
    set = vi.fn(async (key: string, value: string) => {
      if (values.has(key)) return null;
      values.set(key, value);
      return 'OK';
    });
    eval = vi.fn(async (_script: string, _count: number, key: string, owner: string) => {
      if (values.get(key) !== owner) return 0;
      values.delete(key);
      return 1;
    });
    disconnect = vi.fn();
    constructor() {
      clients.push(this);
    }
  },
}));

afterEach(() => {
  clients.length = 0;
  values.clear();
  vi.resetModules();
  process.env.REDIS_URL = '';
  process.env.NODE_ENV = 'test';
});

describe('cron Redis lock', () => {
  it('uses distinct production keys and NX with a TTL', async () => {
    process.env.REDIS_URL = 'redis://redis.example:6379';
    process.env.NODE_ENV = 'production';
    const { cronLockKey, cronScheduleWindowKey, runWithCronLock } =
      await import('./cron-lock.service');

    expect(cronLockKey('process-deadlines')).toContain(':production:process-deadlines');
    expect(cronScheduleWindowKey('daily-summary-email', '2026-09-03')).toContain(
      ':production:daily-summary-email:2026-09-03'
    );

    const result = await runWithCronLock('process-deadlines', async () => 'queued');
    expect(result).toEqual({ acquired: true, value: 'queued' });
    expect(clients[0].set).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'PX',
      600000,
      'NX'
    );
  });

  it('skips a concurrent caller and releases only the owner token', async () => {
    process.env.REDIS_URL = 'redis://redis.example:6379';
    const { runWithCronLock } = await import('./cron-lock.service');
    let release!: () => void;
    const first = runWithCronLock(
      'daily-summary-email',
      () => new Promise<void>((resolve) => { release = resolve; })
    );

    await Promise.resolve();
    const second = await runWithCronLock('daily-summary-email', async () => undefined);
    expect(second).toEqual({ acquired: false });

    release();
    await first;
    expect(clients[0].eval.mock.calls[0][0]).toContain(
      "redis.call('get', KEYS[1]) == ARGV[1]"
    );
  });
});
