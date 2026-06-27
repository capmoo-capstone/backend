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

router.get(
  '/settings/ops-units',
  requireSupplyRoles([ADMIN]),
  controller.getOpsUnits
);
router.get(
  '/settings/representatives',
  requireSupplyRoles([ADMIN]),
  controller.getRepresentatives
);
router.get('/settings/ops-staff', requireSupplyRoles([ADMIN]), controller.getOpsStaff);


export default router;
