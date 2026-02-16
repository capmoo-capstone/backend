import { Router } from 'express';
import * as controller from '../controllers/delegation.controller';

const router = Router();

router.post('/', controller.addDelegation);
router.get('/:id', controller.getById);
router.patch('/:id/cancel', controller.cancelDelegation);

export default router;
