import { Router } from 'express';
import * as projectController from './controller';

const router = Router();

router.get('/', projectController.getAll);
export default router;
