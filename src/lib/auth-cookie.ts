import { CookieOptions, Response } from 'express';

export const AUTH_COOKIE_NAME = 'nexus_access_token';

const getCookieOptions = (): CookieOptions => {
  const isProd = process.env.NODE_ENV === 'production';
  const sameSite =
    (process.env.COOKIE_SAMESITE as CookieOptions['sameSite']) ||
    (isProd ? 'none' : 'lax');

  const options: CookieOptions = {
    httpOnly: true,
    secure: isProd || sameSite === 'none',
    sameSite,
    path: '/api/v1',
    maxAge: 3 * 60 * 60 * 1000,
  };

  if (process.env.COOKIE_DOMAIN) {
    options.domain = process.env.COOKIE_DOMAIN;
  } else if (isProd) {
    options.domain = '.nexus-procure.com';
  }

  return options;
};

export const setAuthCookie = (res: Response, token: string) => {
  res.cookie(AUTH_COOKIE_NAME, token, getCookieOptions());
};

export const clearAuthCookie = (res: Response) => {
  const options = getCookieOptions();
  delete options.maxAge;
  res.clearCookie(AUTH_COOKIE_NAME, options);
};
