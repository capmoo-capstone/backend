import { readFileSync } from 'node:fs';
import { isRedisConfigured, runtimeConfig } from '../../config/runtime';
import { ServiceUnavailableError } from '../../utils/errors';

export type QueueInstance<T> = {
  add(
    name: string,
    data: T,
    options?: Record<string, unknown>
  ): Promise<unknown>;
  close(): Promise<void>;
};

export type WorkerJob<T> = {
  id?: string;
  name: string;
  data: T;
};

export type WorkerInstance<T> = {
  on(
    event: string,
    listener: (...args: unknown[]) => void
  ): WorkerInstance<T>;
  close(): Promise<void>;
};

type BullMqModule = {
  Queue: new <T>(
    name: string,
    options?: Record<string, unknown>
  ) => QueueInstance<T>;
  Worker: new <T>(
    name: string,
    processor: (job: WorkerJob<T>) => Promise<unknown>,
    options?: Record<string, unknown>
  ) => WorkerInstance<T>;
};

export const loadBullMq = () => {
  const runtimeRequire = eval('require') as NodeRequire;
  return runtimeRequire('bullmq') as BullMqModule;
};

const getRedisTlsOptions = () => {
  if (!runtimeConfig.redisUrl.startsWith('rediss://')) return undefined;

  return {
    ca: runtimeConfig.redisTlsCaPath
      ? readFileSync(runtimeConfig.redisTlsCaPath, 'utf8')
      : undefined,
    servername: runtimeConfig.redisTlsServername || undefined,
    rejectUnauthorized: runtimeConfig.redisTlsRejectUnauthorized,
  };
};

export const getQueueConnection = () => {
  if (!runtimeConfig.redisUrl) return null;

  try {
    return {
      url: runtimeConfig.redisUrl,
      tls: getRedisTlsOptions(),
      maxRetriesPerRequest: null,
      connectTimeout: runtimeConfig.cronRequestTimeoutMs,
    };
  } catch (error) {
    console.error('Redis queue connection configuration failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new ServiceUnavailableError('Redis queue is unavailable');
  }
};

export const assertRedisConfigured = (processRole: string) => {
  if (isRedisConfigured() && getQueueConnection()) {
    return;
  }

  throw new Error(`${processRole} requires REDIS_URL to be configured`);
};
