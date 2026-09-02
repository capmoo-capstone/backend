import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runtimeConfig } from '../../config/runtime';
import { ServiceUnavailableError } from '../../utils/errors';


type RedisLockClient = {
  set(...args: Array<string | number>): Promise<'OK' | null>;
  eval(script: string, keyCount: number, ...args: string[]): Promise<number>;
  disconnect(): void;
};

const RELEASE_SCRIPT =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

const loadRedis = () => {
  const runtimeRequire = eval('require') as NodeRequire;
  return runtimeRequire('ioredis') as {
    default: new (url: string, options?: Record<string, unknown>) => RedisLockClient;
  };
};

const getClient = () => {
  if (!runtimeConfig.redisUrl) return null;
  const tls = runtimeConfig.redisUrl.startsWith('rediss://')
    ? {
        ca: runtimeConfig.redisTlsCaPath
          ? readFileSync(runtimeConfig.redisTlsCaPath, 'utf8')
          : undefined,
        servername: runtimeConfig.redisTlsServername || undefined,
        rejectUnauthorized: runtimeConfig.redisTlsRejectUnauthorized,
      }
    : undefined;
  return new (loadRedis().default)(runtimeConfig.redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: runtimeConfig.cronRequestTimeoutMs,
    tls,
  });
};

const withTimeout = async <T>(promise: Promise<T>) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Cron lock request timed out')),
          runtimeConfig.cronRequestTimeoutMs
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export const cronLockKey = (job: string) =>
  `${runtimeConfig.redisPrefix}:cron-lock:${runtimeConfig.cronLockNamespace}:${job}`;

export const cronScheduleWindowKey = (job: string, window: string) =>
  `${runtimeConfig.redisPrefix}:cron-window:${runtimeConfig.cronLockNamespace}:${job}:${window}`;

export const runInCronScheduleWindow = async <T>(job: string, window: string, task: () => Promise<T>) => {
  const client = getClient();
  if (!client) throw new ServiceUnavailableError('Cron queue is unavailable');
  const owner = randomUUID(); const key = cronScheduleWindowKey(job, window); let acquired = false;
  try {
    acquired = (await withTimeout(client.set(key, owner, 'PX', runtimeConfig.cronWindowTtlMs, 'NX'))) === 'OK';
    if (!acquired) return { accepted: false as const };
    return { accepted: true as const, value: await task() };
  } catch (error) {
    if (acquired) await withTimeout(client.eval(RELEASE_SCRIPT, 1, key, owner)).catch(() => undefined);
    throw error;
  } finally { client.disconnect(); }
};

export const runWithCronLock = async <T>(job: string, task: () => Promise<T>) => {
  const client = getClient();
  if (!client) {
    if (process.env.NODE_ENV === 'test' || process.env.VITEST) return { acquired: true as const, value: await task() };
    throw new ServiceUnavailableError('Cron queue is unavailable');
  }

  const key = cronLockKey(job);
  const owner = randomUUID();
  let acquired = false;
  try {
    acquired =
      (await withTimeout(
        client.set(key, owner, 'PX', runtimeConfig.cronLockTtlMs, 'NX')
      )) === 'OK';
    if (!acquired) return { acquired: false as const };
    return { acquired: true as const, value: await task() };
  } finally {
    if (acquired) {
      await withTimeout(client.eval(RELEASE_SCRIPT, 1, key, owner)).catch(
        () => undefined
      );
    }
    client.disconnect();
  }
};
