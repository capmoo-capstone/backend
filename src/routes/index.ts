// Routing for API Version 1
import { Router } from 'express';
import userRoutes from './user.route';
import projectRoutes from './project.route';
import authRoutes from './auth.route';

const router = Router();

router.use('/auth', authRoutes);
router.use('/user', userRoutes);
router.use('/project', projectRoutes);

export default router;
