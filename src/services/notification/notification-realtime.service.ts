import { Response } from 'express';
import { runtimeConfig } from '../../config/runtime';
import { getRedisPublisher, getRedisSubscriber } from '../../lib/redis';
import { NotificationListItemResponse } from '../../types/notification.type';

export interface NotificationRealtimeEvent {
  type: 'notification.created' | 'notification.updated';
  notification: NotificationListItemResponse;
  unread_count: number;
}

type StreamConnection = {
  id: string;
  res: Response;
  keepAlive: NodeJS.Timeout;
};

const USER_CHANNEL_PREFIX = 'notifications:user:';
const connections = new Map<string, Map<string, StreamConnection>>();
let subscriberReady: Promise<void> | null = null;

const writeSse = (res: Response, event: string, data: unknown) => {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
};

const broadcastToUser = (
  userId: string,
  payload: NotificationRealtimeEvent
) => {
  const userConnections = connections.get(userId);
  if (!userConnections) return;

  for (const connection of userConnections.values()) {
    writeSse(connection.res, payload.type, payload);
  }
};

const ensureRedisSubscription = async () => {
  if (!runtimeConfig.realtimeEnabled) return;
  const subscriber = getRedisSubscriber();
  if (!subscriber) return;

  if (!subscriberReady) {
    subscriberReady = (async () => {
      try {
        await subscriber.connect();
        await subscriber.psubscribe(`${USER_CHANNEL_PREFIX}*`);
        subscriber.on('pmessage', (_pattern, channel, message) => {
          const userId = String(channel).replace(USER_CHANNEL_PREFIX, '');
          try {
            const payload = JSON.parse(
              String(message)
            ) as NotificationRealtimeEvent;
            broadcastToUser(userId, payload);
          } catch (error) {
            console.error(
              'Failed to parse notification realtime payload',
              error
            );
          }
        });
        subscriber.on('error', (error) => {
          console.error('Notification realtime subscriber error', error);
        });
      } catch (error) {
        subscriberReady = null;
        throw error;
      }
    })();
  }

  await subscriberReady;
};

export const publishNotificationRealtimeEvent = async (
  userId: string,
  payload: NotificationRealtimeEvent
) => {
  if (!runtimeConfig.realtimeEnabled) return;
  const publisher = getRedisPublisher();
  if (!publisher) return;

  await publisher.connect().catch(() => undefined);
  await publisher.publish(
    `${USER_CHANNEL_PREFIX}${userId}`,
    JSON.stringify(payload)
  );
};

export const openNotificationStream = async (userId: string, res: Response) => {
  try {
    await ensureRedisSubscription();
  } catch (error) {
    console.error('Notification realtime stream unavailable', error);
    writeSse(res, 'disabled', {
      type: 'disabled',
    });
    res.end();
    return;
  }

  const connectionId = `${userId}:${Date.now()}:${Math.random()
    .toString(36)
    .slice(2)}`;

  const keepAlive = setInterval(() => {
    res.write(': ping\n\n');
  }, 25_000);

  const userConnections = connections.get(userId) ?? new Map();
  userConnections.set(connectionId, { id: connectionId, res, keepAlive });
  connections.set(userId, userConnections);

  res.on('close', () => {
    clearInterval(keepAlive);
    const scopedConnections = connections.get(userId);
    scopedConnections?.delete(connectionId);
    if (scopedConnections && scopedConnections.size === 0) {
      connections.delete(userId);
    }
  });

  writeSse(res, 'ready', {
    type: 'ready',
  });
};
