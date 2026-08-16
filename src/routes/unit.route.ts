import { Router } from 'express';
import * as controller from '../controllers/unit.controller';
import {
  protect,
  requireSuperAdmin,
  requireSupplyRoles,
} from '../middlewares/auth';
import { UserRole } from '@prisma/client';

const { ADMIN } = UserRole;

const router = Router();

router.get('/', controller.getAll);
router.post('/create', protect, requireSuperAdmin, controller.createUnit);
router.get('/:id', protect, controller.getById);
router.get('/:id/rep', protect, controller.getRepresentative);
router.patch(
  '/:id/users',
  protect,
  requireSupplyRoles([ADMIN]),
  controller.updateUnitUsers
);
router.patch(
  '/:id/rep',
  protect,
  requireSupplyRoles([ADMIN]),
  controller.updateRepresentative
);
router.patch(
  '/:id/update',
  protect,
  requireSupplyRoles([ADMIN]),
  controller.updateUnit
);
router.delete(
  '/:id',
  protect,
  requireSupplyRoles([ADMIN]),
  controller.removeUnit
);

export default router;
