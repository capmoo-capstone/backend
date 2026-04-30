// Routing for API Version 1
import { Router } from 'express';
import { protect } from '../middlewares/auth';
import userRoutes from './user.route';
import projectRoutes from './project.route';
import authRoutes from './auth.route';
import departmentRoutes from './department.route';
import unitRoutes from './unit.route';
import submissionRoutes from './submission.route';
import delegationRoutes from './delegation.route';
import budgetPlanRoutes from './budget-plan.route';
import vendorRoutes from './vendor.route';
import adminRoutes from './admin.route';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', protect, userRoutes);
router.use('/projects', protect, projectRoutes);
router.use('/departments', protect, departmentRoutes);
router.use('/units', protect, unitRoutes);
router.use('/submissions', protect, submissionRoutes);
router.use('/delegations', protect, delegationRoutes);
router.use('/budget-plans', protect, budgetPlanRoutes);
router.use('/vendors', vendorRoutes);
router.use('/admin', protect, adminRoutes);

export default router;
