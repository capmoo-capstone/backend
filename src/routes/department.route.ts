import { Router } from 'express';
import * as controller from '../controllers/department.controller';
import { requireSuperAdmin } from '../middlewares/auth';

const router = Router();

router.get('/', controller.getAll);
router.post('/create', requireSuperAdmin, controller.createDepartment);
router.get('/:id', controller.getById);
router.patch('/:id/update', requireSuperAdmin, controller.updateDepartment);
router.delete('/:id', requireSuperAdmin, controller.removeDepartment);

export default router;
