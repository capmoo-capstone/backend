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

const router = Router();

router.use('/auth', authRoutes);

const protectedRoutes = [
  ['/users', userRoutes],
  ['/projects', projectRoutes],
  ['/departments', departmentRoutes],
  ['/units', unitRoutes],
  ['/submissions', submissionRoutes],
  ['/delegations', delegationRoutes],
  ['/budget-plans', budgetPlanRoutes],
] as const;

protectedRoutes.forEach(([path, route]) => {
  router.use(path, protect, route);
});

export default router;
