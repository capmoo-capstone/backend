import { Request, Response } from 'express';
import { z } from 'zod';
import * as NotificationService from '../services/notification/notification.service';
import { sendContractCommitteeReminders } from '../services/notification/contract-committee-reminder.service';
import {
  sendDailySummaryEmailsToOpsUsers,
  sendHelloTestEmail,
  sendVendorPoRequestEmailForProject,
} from '../services/notification/notification-email.service';

const SendVendorPoEmailSchema = z.object({
  projectId: z.string().trim().min(1, 'projectId is required'),
});

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
    to: to ?? null,
  });
};

export const sendVendorPoEmail = async (req: Request, res: Response) => {
  // #swagger.tags = ['Cron']
  // #swagger.security = [{ bearerAuth: [] }]
  const { projectId } = SendVendorPoEmailSchema.parse(req.body);
  const result = await sendVendorPoRequestEmailForProject(projectId);

  res.status(200).json({
    status: 'success',
    message: 'Vendor PO email sent',
    projectId: result.projectId,
    poNumber: result.poNumber,
    to: result.recipientEmail,
  });
};

export const sendDailySummaryEmail = async (_req: Request, res: Response) => {
  // #swagger.tags = ['Cron']
  // #swagger.security = [{ bearerAuth: [] }]
  const result = await sendDailySummaryEmailsToOpsUsers();

  res.status(200).json({
    status: 'success',
    message: 'Daily summary emails sent',
    recipientCount: result.recipientCount,
  });
};

export const sendContractCommitteeReminderEmail = async (
  _req: Request,
  res: Response
) => {
  // #swagger.tags = ['Cron']
  // #swagger.security = [{ bearerAuth: [] }]
  const result = await sendContractCommitteeReminders();

  res.status(200).json({
    status: 'success',
    message: 'Contract committee reminder emails sent',
    matchedSubmissionCount: result.matchedSubmissionCount,
    recipientCount: result.recipientCount,
    deliveryCount: result.deliveryCount,
  });
};
