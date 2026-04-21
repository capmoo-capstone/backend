import { Router } from 'express';
import * as controller from '../controllers/unit.controller';
import { requireSupplyRoles } from '../middlewares/auth';
import { UserRole } from '@prisma/client';

const { ADMIN, HEAD_OF_UNIT } = UserRole;

const router = Router();

router.get('/', controller.getAll);
router.post('/create', requireSupplyRoles([ADMIN]), controller.createUnit);
router.get('/:id', controller.getById);
router.get('/:id/rep', controller.getRepresentative);
router.patch(
  '/:id/users',
  requireSupplyRoles([ADMIN, HEAD_OF_UNIT]),
  controller.updateUnitUsers
);
router.patch(
  '/:id/rep',
  requireSupplyRoles([ADMIN]),
  controller.updateRepresentative
);
router.patch(
  '/:id/update',
  requireSupplyRoles([ADMIN, HEAD_OF_UNIT]),
  controller.updateUnit
);
router.delete('/:id', requireSupplyRoles([ADMIN]), controller.removeUnit);

export default router;
