import { Router } from 'express';
import * as userController from '../controllers/user.controller';

const router = Router();

router.get('/', userController.getAll);
router.patch('/add-unit/:unitId', userController.addUsersToUnit);
router.get('/:id', userController.getById);
router.patch('/:id/role', userController.updateRole);
router.patch('/:id/rep/:unitId', userController.addRepresentativeToUnit);
router.delete('/:id', userController.removeUser);

export default router;
