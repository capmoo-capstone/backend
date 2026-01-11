import { Router } from 'express';
import * as userController from './controller';

const router = Router();

router.post('/', userController.signup);
router.get('/', userController.list);

export default router;
