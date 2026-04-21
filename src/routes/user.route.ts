import { Router } from 'express';
import * as controller from '../controllers/user.controller';
import { requireRoles, requireSupplyRoles } from '../middlewares/auth';
import { UserRole } from '@prisma/client';

const { HEAD_OF_UNIT, HEAD_OF_DEPARTMENT, ADMIN } = UserRole;

const router = Router();

router.get('/', controller.getAll);
router.get('/:id', controller.getById);
router.patch(
  '/roles/supply',
  requireSupplyRoles([HEAD_OF_UNIT, HEAD_OF_DEPARTMENT, ADMIN]),
  controller.updateSupplyRole
);
router.post('/:id/role', requireRoles([]), controller.addRole);
router.patch('/:id/role/remove', requireRoles([]), controller.removeRole);
router.delete('/:id', requireRoles([]), controller.removeUser);

export default router;
