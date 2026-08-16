import { Router } from 'express';
import * as controller from '../controllers/cron.controller';
import { protectCron } from '../middlewares/cron-auth';

const router = Router();

router.get(
  '/process-deadlines',
  protectCron,
  controller.processDeadlineNotifications
);

export default router;
