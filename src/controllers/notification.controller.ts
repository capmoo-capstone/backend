import { Response } from 'express';
import {
  ListNotificationsQuerySchema,
  MarkNotificationReadSchema,
} from '../schemas/notification.schema';
import * as NotificationQueryService from '../services/notification/notification.service';
import { AuthenticatedRequest } from '../types/auth.type';

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
