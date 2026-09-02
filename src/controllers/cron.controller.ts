import { Request, Response } from 'express';
import { z } from 'zod';
import { runWithCronLock } from '../services/cron/cron-lock.service';
import { triggerDeadlineReminderScan, triggerScheduledCronTask } from '../services/cron/cron-task.service';
import { sendHelloTestEmail, sendVendorPoRequestEmailForProject } from '../services/notification/notification-email.service';
const SendVendorPoEmailSchema = z.object({ projectId: z.string().trim().min(1, 'projectId is required') });
const sendScheduled = async (job: 'daily-summary-email' | 'contract-committee-reminders', res: Response) => {
  const lock = await runWithCronLock(job, () => triggerScheduledCronTask({ kind: job }));
  if (!lock.acquired) return res.status(200).json({ status: 'success', message: `${job} is already being queued`, skipped: true });
  return res.status(200).json({ status: 'success', message: lock.value.message, queued: lock.value.queued, skipped: lock.value.skipped });
};
export const processDeadlineNotifications = async (_req: Request, res: Response) => {
  const result = await runWithCronLock('process-deadlines', triggerDeadlineReminderScan);
  if (!result.acquired) return res.status(200).json({ status: 'success', message: 'Deadline notification sync already running', skipped: true });
  return res.status(200).json({ status: 'success', message: result.value.message });
};
export const sendTestEmail = async (req: Request, res: Response) => { const to = typeof req.query.to === 'string' && req.query.to.trim() ? req.query.to.trim() : undefined; await sendHelloTestEmail(to); return res.status(200).json({ status: 'success', message: 'Test email sent', to: to ?? null }); };
export const sendVendorPoEmail = async (req: Request, res: Response) => { const { projectId } = SendVendorPoEmailSchema.parse(req.body); const result = await sendVendorPoRequestEmailForProject(projectId); return res.status(200).json({ status: 'success', message: 'Vendor PO email sent', projectId: result.projectId, poNumber: result.poNumber, to: result.recipientEmail }); };
export const sendDailySummaryEmail = async (_req: Request, res: Response) => sendScheduled('daily-summary-email', res);
export const sendContractCommitteeReminderEmail = async (_req: Request, res: Response) => sendScheduled('contract-committee-reminders', res);