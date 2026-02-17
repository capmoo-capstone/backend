import { Router } from 'express';
import * as unitController from '../controllers/unit.controller';

const router = Router();

router.get('/', unitController.getAll);
router.post('/create', unitController.createUnit);
router.get('/:id', unitController.getById);
router.patch('/:id/update', unitController.updateUnit);
router.delete('/:id', unitController.removeUnit);

export default router;
