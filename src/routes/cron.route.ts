import { Router } from 'express';
import * as controller from '../controllers/cron.controller';
import { protectCron } from '../middlewares/cron-auth';

const router = Router();

router.get(
  '/process-deadlines',
  protectCron,
  controller.processDeadlineNotifications
);
router.get('/send-test-email', protectCron, controller.sendTestEmail);
router.post('/send-vendor-po-email', protectCron, controller.sendVendorPoEmail);
router.get(
  '/send-daily-summary-email',
  protectCron,
  controller.sendDailySummaryEmail
);

export default router;

