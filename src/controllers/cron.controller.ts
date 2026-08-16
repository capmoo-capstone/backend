import { Request, Response } from 'express';
import * as NotificationService from '../services/notification/notification.service';

export const processDeadlineNotifications = async (
  _req: Request,
  res: Response
) => {
  // #swagger.tags = ['Cron']
  // #swagger.security = [{ bearerAuth: [] }]
  await NotificationService.enqueueDeadlineReminderScan();

  res.status(200).json({
    status: 'success',
    message: 'Deadline notification sync completed',
  });
};
