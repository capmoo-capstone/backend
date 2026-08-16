import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '../../lib/errors';
import type { AuthPayload } from '../../types/auth.type';
import { runtimeConfig } from '../../config/runtime';

const STREAM_TOKEN_AUDIENCE = 'notification-stream';

type StreamTokenPayload = {
  sub: string;
  aud: typeof STREAM_TOKEN_AUDIENCE;
  type: 'notification-stream';
};

export const issueNotificationStreamToken = (user: AuthPayload) => {
  const token = jwt.sign(
    {
      sub: user.id,
      aud: STREAM_TOKEN_AUDIENCE,
      type: 'notification-stream',
    } satisfies StreamTokenPayload,
    process.env.JWT_SECRET as string,
    { expiresIn: runtimeConfig.streamTokenTtlSeconds }
  );

  return {
    token,
    expires_in_seconds: runtimeConfig.streamTokenTtlSeconds,
  };
};

export const verifyNotificationStreamToken = (token: string) => {
  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET as string
    ) as StreamTokenPayload;

    if (
      payload.type !== 'notification-stream' ||
      payload.aud !== STREAM_TOKEN_AUDIENCE ||
      !payload.sub
    ) {
      throw new UnauthorizedError('Invalid notification stream token');
    }

    return { userId: payload.sub };
  } catch {
    throw new UnauthorizedError('Invalid or expired notification stream token');
  }
};
