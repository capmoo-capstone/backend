import { describe, expect, it } from 'vitest';
import type { AuthPayload } from '../../types/auth.type';
import {
  issueNotificationStreamToken,
  verifyNotificationStreamToken,
} from '../notification/notification-stream-token.service';

const user: AuthPayload = {
  token: 'user-token',
  id: 'user-1',
  username: 'user',
  full_name: 'User One',
  roles: [],
  is_delegated: false,
  delegated_by: [],
};

describe('notification stream token service', () => {
  it('issues and verifies a short-lived stream token', () => {
    const issued = issueNotificationStreamToken(user);

    expect(issued.token).toBeTruthy();
    expect(issued.expires_in_seconds).toBeGreaterThan(0);
    expect(verifyNotificationStreamToken(issued.token)).toEqual({
      userId: user.id,
    });
  });

  it('rejects an invalid stream token', () => {
    expect(() => verifyNotificationStreamToken('invalid-token')).toThrow(
      'Invalid or expired notification stream token'
    );
  });
});
