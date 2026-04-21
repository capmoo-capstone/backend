import { LRUCache } from 'lru-cache';
import { AuthPayload } from '../types/auth.type';

type CachedAuthData = Omit<AuthPayload, 'token' | 'id' | 'username' | 'full_name'> & {
  cached_at: Date;
};

const userAuthCache = new LRUCache<string, CachedAuthData>({
  max: 50,
  ttl: 30 * 60 * 1000,
});

export const getUserAuthCache = (userId: string) => userAuthCache.get(userId);

export const setUserAuthCache = (
  userId: string,
  value: Omit<CachedAuthData, 'cached_at'>
) => {
  userAuthCache.set(userId, {
    ...value,
    cached_at: new Date(),
  });
};

export const clearUserAuthCache = (userId: string) => {
  userAuthCache.delete(userId);
};
