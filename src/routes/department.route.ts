import { Router } from 'express';
import * as departmentController from '../controllers/department.controller';

const router = Router();

router.get('/', departmentController.getAll);
router.post('/create', departmentController.createDepartment);
router.get('/:id', departmentController.getById);
router.patch('/:id/update', departmentController.updateDepartment);
router.delete('/:id', departmentController.removeDepartment);

export default router;
