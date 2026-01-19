import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { protect } from '../middlewares/auth';

const router = Router();

router.post('/login', authController.login);
router.get('/me', protect, authController.getMe);
router.post('/logout', protect, authController.logout);

export default router;
