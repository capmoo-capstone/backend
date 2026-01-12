import { Router } from 'express';
import * as userController from './controller';

const router = Router();

router.get('/', userController.list);
router.post('/signup', userController.signup);

export default router;
