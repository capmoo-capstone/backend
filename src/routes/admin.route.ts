import { Router } from 'express';
import * as controller from '../controllers/admin.controller';
import { requireSuperAdmin } from '../middlewares/auth';

const router = Router();

router.get('/audit-logs', requireSuperAdmin, controller.getAuditLogs);

export default router;
