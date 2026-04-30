import { Router } from 'express';
import * as controller from '../controllers/admin.controller';
import { requireSupplyRoles } from '../middlewares/auth';
import { UserRole } from '@prisma/client';

const { HEAD_OF_DEPARTMENT, ADMIN } = UserRole;

const router = Router();

router.get(
  '/audit-logs',
  requireSupplyRoles([HEAD_OF_DEPARTMENT, ADMIN]),
  controller.getAuditLogs
);

export default router;
