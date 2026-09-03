const parseBoolean = (value: string | undefined, fallback: boolean) => {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
};

const parseNumber = (value: string | undefined, fallback: number) => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseCronExecutionMode = (value: string | undefined) => {
  if (value === 'queue' || value === 'direct') return value;
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) return 'queue';
  throw new Error('CRON_EXECUTION_MODE must be either queue or direct');
};

const parseEmailAllowlist = (value: string | undefined) =>
  new Set(
    (value || '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );

export const runtimeConfig = {
  cronExecutionMode: parseCronExecutionMode(process.env.CRON_EXECUTION_MODE),
  cronEmailAllowlist: parseEmailAllowlist(process.env.CRON_EMAIL_ALLOWLIST),
  redisUrl: process.env.REDIS_URL?.trim() || '',
  redisPrefix: process.env.REDIS_PREFIX?.trim() || 'nexus-procure',
  redisTlsCaPath: process.env.REDIS_TLS_CA_PATH?.trim() || '',
  redisTlsServername: process.env.REDIS_TLS_SERVERNAME?.trim() || '',
  redisTlsRejectUnauthorized: parseBoolean(
    process.env.REDIS_TLS_REJECT_UNAUTHORIZED,
    true
  ),
  cronSecret: process.env.CRON_SECRET?.trim() || '',
  cronLockNamespace:
    process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production'
      ? 'production'
      : process.env.VERCEL_ENV?.trim() || 'local',
  cronLockTtlMs: 10 * 60_000,
  cronWindowTtlMs: 36 * 60 * 60_000,
  cronRequestTimeoutMs: 60_000,
  realtimeEnabled: parseBoolean(
    process.env.NOTIFICATIONS_REALTIME_ENABLED,
    Boolean(process.env.REDIS_URL)
  ),
  pollingFallbackMs: parseNumber(
    process.env.NOTIFICATIONS_POLLING_FALLBACK_MS,
    60_000
  ),
  streamTokenTtlSeconds: parseNumber(
    process.env.NOTIFICATIONS_STREAM_TOKEN_TTL_SECONDS,
    300
  ),
  deadlineWorkerRepeatMs: parseNumber(
    process.env.NOTIFICATIONS_DEADLINE_REPEAT_MS,
    5 * 60_000
  ),
  outboxWorkerRepeatMs: parseNumber(
    process.env.NOTIFICATIONS_OUTBOX_REPEAT_MS,
    30_000
  ),
  notificationCleanupRepeatMs: 24 * 60 * 60_000,
};

export const isRedisConfigured = () => Boolean(runtimeConfig.redisUrl);
