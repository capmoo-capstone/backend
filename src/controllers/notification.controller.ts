import { Response } from 'express';
import {
  ListNotificationsQuerySchema,
  MarkNotificationReadSchema,
  NotificationStreamQuerySchema,
} from '../schemas/notification.schema';
import * as NotificationQueryService from '../services/notification/notification.service';
import { AuthenticatedRequest } from '../types/auth.type';
import {
  issueNotificationStreamToken,
  verifyNotificationStreamToken,
} from '../services/notification/notification-stream-token.service';
import { openNotificationStream } from '../services/notification/notification-realtime.service';
import { runtimeConfig } from '../config/runtime';

export const listNotifications = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Notifications']
  // #swagger.security = [{ bearerAuth: [] }]
  const user = req.user!;
  const query = ListNotificationsQuerySchema.parse(req.query);
  const data = await NotificationQueryService.listNotifications(user, query);
  res.status(200).json(data);
};

export const markNotificationRead = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Notifications']
  // #swagger.security = [{ bearerAuth: [] }]
  const user = req.user!;
  const { id } = MarkNotificationReadSchema.parse(req.params);
  const data = await NotificationQueryService.markNotificationRead(user, id);
  res.status(200).json(data);
};

export const markAllNotificationsRead = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Notifications']
  // #swagger.security = [{ bearerAuth: [] }]
  const user = req.user!;
  await NotificationQueryService.markAllNotificationsRead(user);
  res.status(204).send();
};

export const issueStreamToken = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Notifications']
  // #swagger.security = [{ bearerAuth: [] }]
  const user = req.user!;
  const payload = issueNotificationStreamToken(user);
  res.status(200).json(payload);
};

export const streamNotifications = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  // #swagger.tags = ['Notifications']
  const { token } = NotificationStreamQuerySchema.parse(req.query);
  const { userId } = verifyNotificationStreamToken(token);

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  if (!runtimeConfig.realtimeEnabled) {
    res.write('event: disabled\n');
    res.write(
      `data: ${JSON.stringify({
        type: 'disabled',
      })}\n\n`
    );
    res.end();
    return;
  }

  await openNotificationStream(userId, res);
};
