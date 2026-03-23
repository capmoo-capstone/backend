import { Router } from 'express';
import * as controller from '../controllers/budget-plan.controller';

const router = Router();

router.get('/', controller.getAll);
router.post('/', controller.importBudgetPlan);
router.patch('/:id/projects/:projectId', controller.updateProjectIdPlan);
router.delete('/:id', controller.removeBudgetPlan);

export default router;
