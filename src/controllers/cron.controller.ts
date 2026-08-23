import { Request, Response } from 'express';
import * as NotificationService from '../services/notification/notification.service';
import { sendHelloTestEmail } from '../services/notification/notification-email.service';

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

export const sendTestEmail = async (req: Request, res: Response) => {
  // #swagger.tags = ['Cron']
  // #swagger.security = [{ bearerAuth: [] }]
  const to =
    typeof req.query.to === 'string' && req.query.to.trim().length > 0
      ? req.query.to.trim()
      : undefined;

  await sendHelloTestEmail(to);

  res.status(200).json({
    status: 'success',
    message: 'Test email sent',
    to: to ?? process.env.RESEND_TEST_TO ?? null,
  });
};
