import { Router } from 'express';
import * as controller from '../controllers/delegation.controller';
import { requireSupplyAccess, requireSupplyRoles } from '../middlewares/auth';
import { UserRole } from '@prisma/client';

const { ADMIN } = UserRole;

const router = Router();

router.post('/', requireSupplyRoles([ADMIN]), controller.addDelegation);
router.get('/active', requireSupplyAccess, controller.getActiveDelegation);
router.get('/:id', requireSupplyAccess, controller.getById);
router.patch(
  '/:id/cancel',
  requireSupplyRoles([ADMIN]),
  controller.cancelDelegation
);

export default router;
