import { Router } from 'express';
import * as controller from '../controllers/budgetPlan.controller';

const router = Router();

router.get('/', controller.getAll);
router.post('/', controller.importBudgetPlan);
router.patch('/:id/project/:projectId', controller.updateProjectIdPlan);
router.delete('/:id', controller.removeBudgetPlan);

export default router;
