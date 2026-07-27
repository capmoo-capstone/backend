import { Router } from 'express';
import * as controller from '../controllers/notification.controller';

const router = Router();

router.get('/', controller.listNotifications);
router.patch('/read-all', controller.markAllNotificationsRead);
router.patch('/:id/read', controller.markNotificationRead);

export default router;
