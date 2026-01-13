// Routing for API Version 1
import { Router } from 'express';
import userRoutes from './user.route';
import projectRoutes from './project.route';

const router = Router();

router.use('/users', userRoutes);
router.use('/projects', projectRoutes);

export default router;
