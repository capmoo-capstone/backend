import { Router } from 'express';
import * as userController from '../controllers/user.controller';

const router = Router();

router.get('/', userController.getAll);
router.get('/:id', userController.getById);
router.post('/signup', userController.signup);

export default router;
