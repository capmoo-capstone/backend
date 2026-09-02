import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Redis from 'ioredis';
import { runtimeConfig } from '../../config/runtime';
import { ServiceUnavailableError } from '../../utils/errors';

type RedisLockClient = {
  set(...args: Array<string | number>): Promise<'OK' | null>;
  eval(script: string, keyCount: number, ...args: string[]): Promise<number>;
  disconnect(): void;
};

const RELEASE_SCRIPT =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

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

  return new Redis(runtimeConfig.redisUrl, {
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
          () => reject(new Error('Cron Redis request timed out')),
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

const reserve = async <T>(
  key: string,
  ttlMs: number,
  task: () => Promise<T>,
  releaseOnFailure: boolean
) => {
  const client = getClient();
  if (!client) {
    if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
      return { acquired: true as const, value: await task() };
    }

    throw new ServiceUnavailableError('Cron queue is unavailable');
  }

  const owner = randomUUID();
  let acquired = false;

  try {
    acquired =
      (await withTimeout(client.set(key, owner, 'PX', ttlMs, 'NX'))) === 'OK';
    if (!acquired) return { acquired: false as const };

    return { acquired: true as const, value: await task() };
  } catch {
    if (acquired && releaseOnFailure) {
      await withTimeout(client.eval(RELEASE_SCRIPT, 1, key, owner)).catch(
        () => undefined
      );
    }

    throw new ServiceUnavailableError('Cron queue is unavailable');
  } finally {
    if (acquired && !releaseOnFailure) {
      await withTimeout(client.eval(RELEASE_SCRIPT, 1, key, owner)).catch(
        () => undefined
      );
    }
    client.disconnect();
  }
};

export const runWithCronLock = <T>(job: string, task: () => Promise<T>) =>
  reserve(cronLockKey(job), runtimeConfig.cronLockTtlMs, task, false);

export const runInCronScheduleWindow = <T>(
  job: string,
  window: string,
  task: () => Promise<T>
) =>
  reserve(
    cronScheduleWindowKey(job, window),
    runtimeConfig.cronWindowTtlMs,
    task,
    true
  );
