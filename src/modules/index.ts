// Routing for API Version 1
import { Router } from 'express';
import userRoutes from './users/index';

const router = Router();

router.use('/users', userRoutes);

export default router;
