// Routing for API Version 1
import { Router } from 'express';
import { protect, authorize } from '../middlewares/auth';
import userRoutes from './user.route';
import projectRoutes from './project.route';
import authRoutes from './auth.route';
import departmentRoutes from './department.route';
import unitRoutes from './unit.route';
import submissionRoutes from './submission.route';

const router = Router();

router.use('/auth', authRoutes);
router.use('/user', protect, userRoutes);
router.use('/project', protect, projectRoutes);
router.use('/department', protect, departmentRoutes);
router.use('/unit', protect, unitRoutes);
router.use('/submission', protect, submissionRoutes);

export default router;
