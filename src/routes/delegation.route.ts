import { Router } from 'express';
import * as controller from '../controllers/delegation.controller';
import { requireSupplyRoles } from '../middlewares/auth';
import { UserRole } from '@prisma/client';

const { HEAD_OF_UNIT, HEAD_OF_DEPARTMENT } = UserRole;

const router = Router();

router.post(
  '/',
  requireSupplyRoles([HEAD_OF_UNIT, HEAD_OF_DEPARTMENT]),
  controller.addDelegation
);
router.get(
  '/active',
  requireSupplyRoles([HEAD_OF_UNIT, HEAD_OF_DEPARTMENT]),
  controller.getActiveDelegation
);
router.get('/:id', requireSupplyRoles([]), controller.getById);
router.patch(
  '/:id/cancel',
  requireSupplyRoles([HEAD_OF_UNIT, HEAD_OF_DEPARTMENT]),
  controller.cancelDelegation
);

export default router;
