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

router.get(
  '/unit-group/executive-summary',
  requireSupplyRoles([GENERAL_STAFF, HEAD_OF_UNIT, HEAD_OF_DEPARTMENT]),
  controller.getUnitGroupExecutiveSummary
);
router.get(
  '/unit-group/procurement-metrics',
  requireSupplyRoles([GENERAL_STAFF, HEAD_OF_UNIT, HEAD_OF_DEPARTMENT]),
  controller.getUnitGroupProcurementMetrics
);
router.get(
  '/unit-group/procurement-details',
  requireSupplyRoles([GENERAL_STAFF, HEAD_OF_UNIT, HEAD_OF_DEPARTMENT]),
  controller.getUnitGroupProcurementDetails
);
router.get(
  '/unit-group/top-delayed',
  requireSupplyRoles([GENERAL_STAFF, HEAD_OF_UNIT, HEAD_OF_DEPARTMENT]),
  controller.getUnitGroupTopDelayedProjects
);
router.get(
  '/unit-group/staff-performance',
  requireSupplyRoles([GENERAL_STAFF, HEAD_OF_UNIT, HEAD_OF_DEPARTMENT]),
  controller.getUnitGroupStaffPerformance
);
router.get(
  '/unit-group/contract-summary',
  requireSupplyRoles([GENERAL_STAFF, HEAD_OF_UNIT, HEAD_OF_DEPARTMENT]),
  controller.getContractUnitSummary
);
router.get(
  '/individual-summary',
  requireSupplyRoles([GENERAL_STAFF, HEAD_OF_UNIT, HEAD_OF_DEPARTMENT]),
  controller.getIndividualStaffDashboard
);

router.get(
  '/individual-todo',
  requireSupplyRoles([HEAD_OF_UNIT, HEAD_OF_DEPARTMENT]),
  controller.getIndividualStaffTodo
);

router.get(
  '/individual-todo/total',
  requireSupplyRoles([HEAD_OF_UNIT, HEAD_OF_DEPARTMENT]),
  controller.getIndividualStaffTodoTotal
);

export default router;


