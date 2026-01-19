// Routing for API Version 1
import { Router } from 'express';
import { protect, authorize } from '../middlewares/auth';
import userRoutes from './user.route';
import projectRoutes from './project.route';
import authRoutes from './auth.route';

const router = Router();

router.use('/auth', authRoutes);
router.use('/user', protect, userRoutes);
router.use(
  '/project',
  protect,
  authorize(['ADMIN', 'STAFF', 'MANAGER']),
  projectRoutes
);

export default router;
