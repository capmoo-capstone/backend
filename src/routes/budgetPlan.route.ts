import { Router } from 'express';
import * as controller from '../controllers/budgetPlan.controller';

const router = Router();

router.get('/', controller.getAll);

export default router;