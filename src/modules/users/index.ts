import { Router } from 'express';
import * as userController from './controller';

const router = Router();

router.get('/', userController.getAll);
router.get('/:username', userController.getByUsername);
router.post('/signup', userController.signup);

export default router;
