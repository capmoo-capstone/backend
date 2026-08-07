import { describe, expect, it, vi } from 'vitest';
import { Response } from 'express';
import {
  AUTH_COOKIE_NAME,
  clearAuthCookie,
  setAuthCookie,
} from '../auth-cookie';

describe('authentication cookie', () => {
  it('uses configured cookie options', () => {
    const cookie = vi.fn();
    const clearCookie = vi.fn();
    const response = {
      cookie,
      clearCookie,
    } as unknown as Response;

    setAuthCookie(response, 'signed-token');

    expect(cookie).toHaveBeenCalledWith(
      AUTH_COOKIE_NAME,
      'signed-token',
      expect.objectContaining({
        httpOnly: true,
        path: '/api/v1',
        maxAge: 3 * 60 * 60 * 1000,
      })
    );

    clearAuthCookie(response);
    expect(clearCookie).toHaveBeenCalledWith(
      AUTH_COOKIE_NAME,
      expect.objectContaining({ path: '/api/v1' })
    );
  });
});
