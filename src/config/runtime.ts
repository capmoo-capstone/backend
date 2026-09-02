const parseBoolean = (value: string | undefined, fallback: boolean) => {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
};

const parseNumber = (value: string | undefined, fallback: number) => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const runtimeConfig = {
  redisUrl: process.env.REDIS_URL?.trim() || '',
  redisPrefix: process.env.REDIS_PREFIX?.trim() || 'nexus-procure',
  redisTlsCaPath: process.env.REDIS_TLS_CA_PATH?.trim() || '',
  redisTlsServername: process.env.REDIS_TLS_SERVERNAME?.trim() || '',
  redisTlsRejectUnauthorized: parseBoolean(
    process.env.REDIS_TLS_REJECT_UNAUTHORIZED,
    true
  ),
  cronSecret: process.env.CRON_SECRET?.trim() || '',
  cronLockNamespace: process.env.CRON_LOCK_NAMESPACE?.trim() || (process.env.VERCEL_ENV === 'production' ? 'production' : process.env.VERCEL_ENV?.trim() || (process.env.NODE_ENV === 'production' ? 'production' : 'local')),
  cronLockTtlMs: parseNumber(process.env.CRON_LOCK_TTL_MS, 10 * 60_000),
  cronWindowTtlMs: parseNumber(process.env.CRON_WINDOW_TTL_MS, 36 * 60 * 60_000),
  cronRequestTimeoutMs: parseNumber(process.env.CRON_REQUEST_TIMEOUT_MS, 60_000),
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
  contractCommitteeReminderCron:
    process.env.CONTRACT_COMMITTEE_REMINDER_CRON?.trim() || '30 0 * * *',
  dailySummaryEmailCron:
    process.env.DAILY_SUMMARY_EMAIL_CRON?.trim() || '0 3 * * 1-5',
  schedulerTimezone: process.env.SCHEDULER_TIMEZONE?.trim() || 'UTC',
};

export const isRedisConfigured = () => Boolean(runtimeConfig.redisUrl);
