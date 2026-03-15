import { Router } from 'express';
import * as controller from '../controllers/department.controller';

const router = Router();

router.get('/', controller.getAll);
router.post('/create', controller.createDepartment);
router.get('/:id', controller.getById);
router.patch('/:id/update', controller.updateDepartment);
router.delete('/:id', controller.removeDepartment);

export default router;
