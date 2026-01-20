import { Router } from 'express';
import * as departmentController from '../controllers/department.controller';

const router = Router();

router.get('/', departmentController.getAll);
router.post('/create', departmentController.createDepartment);
router.get('/:departmentId', departmentController.getById);
router.patch('/:departmentId/update', departmentController.updateDepartment);
router.delete('/:departmentId', departmentController.removeDepartment);

export default router;
