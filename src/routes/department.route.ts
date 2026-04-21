import { Router } from 'express';
import * as controller from '../controllers/department.controller';
import { requireSupplyRoles } from '../middlewares/auth';
import { UserRole } from '@prisma/client';

const { ADMIN } = UserRole;

const router = Router();

router.get('/', controller.getAll);
router.post(
  '/create',
  requireSupplyRoles([ADMIN]),
  controller.createDepartment
);
router.get('/:id', controller.getById);
router.patch(
  '/:id/update',
  requireSupplyRoles([ADMIN]),
  controller.updateDepartment
);
router.delete('/:id', requireSupplyRoles([ADMIN]), controller.removeDepartment);

export default router;
