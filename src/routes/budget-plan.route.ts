import { Router } from 'express';
import * as controller from '../controllers/budget-plan.controller';
import { requireSupplyRoles } from '../middlewares/auth';
import { UserRole } from '@prisma/client';

const { ADMIN, GENERAL_STAFF } = UserRole;

const router = Router();

router.get('/', controller.getAll);
router.post('/', requireSupplyRoles([ADMIN]), controller.importBudgetPlan);
router.patch(
  '/:id/projects/:projectId',
  requireSupplyRoles([ADMIN, GENERAL_STAFF]),
  controller.updateProjectIdPlan
);
router.delete('/:id', requireSupplyRoles([ADMIN]), controller.removeBudgetPlan);

export default router;
