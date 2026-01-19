import { Router } from 'express';
import * as userController from '../controllers/user.controller';

const router = Router();

router.get('/', userController.getAll);
router.get('/:id', userController.getById);
router.patch('/:id/update', userController.updateUser);
router.patch('/:id/role', userController.updateRole);
router.patch('/:id/delegate', userController.setUserDelegate);
router.patch('/:id/revoke-delegate', userController.revokeDelegate);
router.delete('/:id', userController.removeUser);

export default router;
