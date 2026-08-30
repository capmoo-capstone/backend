import { LRUCache } from 'lru-cache';
import { AuthPayload } from '../types/auth.type';
import { nowUtc } from './date';

type CachedAuthData = Omit<
  AuthPayload,
  'token' | 'id' | 'username' | 'email' | 'full_name'
> & {
  cached_at: Date;
};

const userAuthCache = new LRUCache<string, CachedAuthData>({
  max: 50,
  ttl: 30 * 60 * 1000,
});

export const getUserAuthCache = (userId: string) => userAuthCache.get(userId);

export const setUserAuthCache = (
  userId: string,
  value: Omit<CachedAuthData, 'cached_at'>,
  expiresAt?: Date | null
) => {
  const now = nowUtc();
  const ttl = expiresAt
    ? Math.max(1, Math.min(30 * 60 * 1000, expiresAt.getTime() - now.getTime()))
    : undefined;
  userAuthCache.set(
    userId,
    {
      ...value,
      cached_at: now,
    },
    ttl === undefined ? undefined : { ttl }
  );
};

export const clearUserAuthCache = (userId: string) => {
  userAuthCache.delete(userId);
};
