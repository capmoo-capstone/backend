import { UserRole } from '@prisma/client';
import { Router } from 'express';
import * as controller from '../controllers/dashboard.controller';
import { requireSupplyRoles } from '../middlewares/auth';

const router = Router();

const { GENERAL_STAFF, HEAD_OF_UNIT, HEAD_OF_DEPARTMENT } = UserRole;

router.get(
  '/periodic-summary',
  requireSupplyRoles([HEAD_OF_UNIT, HEAD_OF_DEPARTMENT]),
  controller.getPeriodicSummary
);
router.get('/procurement-overview', controller.getProcurementOverview);
router.get(
  '/deadlines/overdue',
  requireSupplyRoles([GENERAL_STAFF, HEAD_OF_UNIT, HEAD_OF_DEPARTMENT]),
  controller.getOverdueDeadlines
);
router.get(
  '/deadlines/due-soon',
  requireSupplyRoles([GENERAL_STAFF, HEAD_OF_UNIT, HEAD_OF_DEPARTMENT]),
  controller.getDueSoonDeadlines
);

export default router;
