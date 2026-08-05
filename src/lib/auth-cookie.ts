import { CookieOptions, Response } from 'express';

export const AUTH_COOKIE_NAME = 'nexus_access_token';

const getCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/api/v1',
  maxAge: 3 * 60 * 60 * 1000,
});

export const setAuthCookie = (res: Response, token: string) => {
  // Omitting `domain` deliberately makes this a host-only cookie.
  res.cookie(AUTH_COOKIE_NAME, token, getCookieOptions());
};

export const clearAuthCookie = (res: Response) => {
  const options = getCookieOptions();
  delete options.maxAge;
  res.clearCookie(AUTH_COOKIE_NAME, options);
};
