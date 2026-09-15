import { Request, Response } from 'express';
import { z } from 'zod';
import { runtimeConfig } from '../config/runtime';
import { runWithCronLock } from '../services/cron/cron-lock.service';
import {
  triggerDeadlineReminderScan,
  triggerScheduledCronTask,
} from '../services/cron/cron-task.service';
import {
  DirectCronJob,
  runDirectCronTask,
} from '../services/cron/direct-cron.service';
import {
  sendHelloTestEmail,
  sendVendorEmailForProject,
} from '../services/notification/notification-email.service';
import { CronSendVendorPoEmailSchema } from '../schemas/project.schema';

const sendCronResponse = async (
  job: DirectCronJob,
  queueTask: () => Promise<{
    message: string;
    queued?: boolean;
    skipped?: boolean;
  }>,
  res: Response
) => {
  // #swagger.tags = ['Cron']
  // #swagger.security = [{ bearerAuth: [] }]
  if (runtimeConfig.cronExecutionMode === 'direct') {
    const result = await runDirectCronTask(job);
    return res.status(200).json({
      status: 'success',
      message: result.message,
      direct: true,
      skipped: result.skipped,
    });
  }

  const lock = await runWithCronLock(job, queueTask);
  if (!lock.acquired) {
    return res.status(200).json({
      status: 'success',
      message: `${job} is already being queued`,
      skipped: true,
    });
  }

  return res.status(200).json({
    status: 'success',
    message: lock.value.message,
    queued: lock.value.queued ?? true,
    skipped: lock.value.skipped ?? false,
  });
};

export const processDeadlineNotifications = async (
  _req: Request,
  res: Response
) => sendCronResponse('process-deadlines', triggerDeadlineReminderScan, res);

export const sendTestEmail = async (req: Request, res: Response) => {
  // #swagger.tags = ['Cron']
  // #swagger.security = [{ bearerAuth: [] }]
  const to =
    typeof req.query.to === 'string' && req.query.to.trim().length > 0
      ? req.query.to.trim()
      : undefined;

  await sendHelloTestEmail(to);
  return res.status(200).json({
    status: 'success',
    message: 'Test email sent',
    to: to ?? null,
  });
};

export const sendVendorPoEmail = async (req: Request, res: Response) => {
  // #swagger.tags = ['Cron']
  // #swagger.security = [{ bearerAuth: [] }]
  const { projectId, recipient, data } = CronSendVendorPoEmailSchema.parse(
    req.body
  );
  const result = await sendVendorEmailForProject(projectId, {
    recipient,
    templateId: 'VENDOR_PO_REQUEST',
    data,
  });

  return res.status(200).json({
    status: 'success',
    message: 'Vendor email sent',
    projectId: result.projectId,
    to: result.recipientEmail,
  });
};

export const sendDailySummaryEmail = async (_req: Request, res: Response) =>
  sendCronResponse(
    'daily-summary-email',
    () => triggerScheduledCronTask({ kind: 'daily-summary-email' }),
    res
  );

export const sendContractCommitteeReminderEmail = async (
  _req: Request,
  res: Response
) =>
  sendCronResponse(
    'contract-committee-reminders',
    () => triggerScheduledCronTask({ kind: 'contract-committee-reminders' }),
    res
  );
