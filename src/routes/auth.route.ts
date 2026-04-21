import { Router } from 'express';
import * as controller from '../controllers/auth.controller';
import { protect } from '../middlewares/auth';

const router = Router();

router.post('/register', controller.register);
router.post('/login', controller.login);
router.get('/me', protect, controller.getMe);
router.patch('/logout', protect, controller.logout);

export default router;
