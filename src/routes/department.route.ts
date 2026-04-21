import { Router } from 'express';
import * as controller from '../controllers/department.controller';
import { requireRoles } from '../middlewares/auth';
import { UserRole } from '@prisma/client';

const { ADMIN } = UserRole;

const router = Router();

router.get('/', controller.getAll);
router.post('/create', requireRoles([ADMIN]), controller.createDepartment);
router.get('/:id', controller.getById);
router.patch('/:id/update', requireRoles([ADMIN]), controller.updateDepartment);
router.delete('/:id', requireRoles([ADMIN]), controller.removeDepartment);

export default router;
