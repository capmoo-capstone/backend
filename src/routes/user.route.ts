import { Router } from 'express';
import * as controller from '../controllers/user.controller';
import { requireSuperAdmin, requireSupplyRoles } from '../middlewares/auth';
import { UserRole } from '@prisma/client';

const { ADMIN } = UserRole;

const router = Router();

router.get('/', controller.getAll);
router.patch(
  '/roles/supply',
  requireSupplyRoles([ADMIN]),
  controller.updateSupplyRole
);
router.post(
  '/new',
  requireSupplyRoles([UserRole.ADMIN]),
  controller.createUser
);
router.get('/:id', controller.getById);
router.post('/:id/role', requireSupplyRoles([ADMIN]), controller.addRole);
router.patch(
  '/:id/role/remove',
  requireSupplyRoles([ADMIN]),
  controller.removeRole
);
router.delete('/:id', requireSuperAdmin, controller.removeUser);

export default router;
