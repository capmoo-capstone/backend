// Routing for API Version 1
import { Router } from 'express';
import { protect, authorize } from '../middlewares/auth';
import userRoutes from './user.route';
import projectRoutes from './project.route';
import authRoutes from './auth.route';
import departmentRoutes from './department.route';
import unitRoutes from './unit.route';

const router = Router();

router.use('/auth', authRoutes);
router.use('/user', userRoutes);
router.use('/project', projectRoutes);
router.use('/department', departmentRoutes);
router.use('/unit', unitRoutes);

export default router;
