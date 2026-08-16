import { Router } from 'express';
import * as controller from '../controllers/notification.controller';
import { protect } from '../middlewares/auth';

const router = Router();

router.get('/stream', controller.streamNotifications);
router.post('/stream-token', protect, controller.issueStreamToken);
router.get('/', protect, controller.listNotifications);
router.patch('/read-all', protect, controller.markAllNotificationsRead);
router.patch('/:id/read', protect, controller.markNotificationRead);

export default router;
