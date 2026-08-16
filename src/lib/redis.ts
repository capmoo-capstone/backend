import { runtimeConfig } from '../config/runtime';

type RedisClient = {
  connect(): Promise<void>;
  quit(): Promise<void>;
  publish(channel: string, message: string): Promise<number>;
  psubscribe(...patterns: string[]): Promise<void>;
  on(event: string, listener: (...args: unknown[]) => void): RedisClient;
};

let publisherClient: RedisClient | null = null;
let subscriberClient: RedisClient | null = null;

const loadRedis = () => {
  const runtimeRequire = eval('require') as NodeRequire;
  return runtimeRequire('ioredis') as {
    default: new (url?: string, options?: Record<string, unknown>) => RedisClient;
  };
};

const createRedisClient = (blocking = false) =>
  new (loadRedis().default)(runtimeConfig.redisUrl, {
    maxRetriesPerRequest: blocking ? null : 1,
    lazyConnect: true,
    enableOfflineQueue: !blocking,
    tls: runtimeConfig.redisUrl.startsWith('rediss://') ? {} : undefined,
  });

export const getRedisPublisher = () => {
  if (!runtimeConfig.redisUrl) return null;
  publisherClient ??= createRedisClient(false);
  return publisherClient;
};

export const getRedisSubscriber = () => {
  if (!runtimeConfig.redisUrl) return null;
  subscriberClient ??= createRedisClient(true);
  return subscriberClient;
};

export const closeRedisClients = async () => {
  await Promise.allSettled([
    publisherClient?.quit(),
    subscriberClient?.quit(),
  ]);
  publisherClient = null;
  subscriberClient = null;
};
