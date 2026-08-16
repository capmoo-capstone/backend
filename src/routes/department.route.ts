import { Router } from 'express';
import * as controller from '../controllers/department.controller';
import { protect, requireSuperAdmin } from '../middlewares/auth';

const router = Router();

router.get('/', controller.getAll);
router.post('/create', protect, requireSuperAdmin, controller.createDepartment);
router.get('/:id', protect, controller.getById);
router.patch(
  '/:id/update',
  protect,
  requireSuperAdmin,
  controller.updateDepartment
);
router.delete('/:id', protect, requireSuperAdmin, controller.removeDepartment);

export default router;
