import { Router } from 'express';
import * as unitController from '../controllers/unit.controller';

const router = Router();

router.get('/', unitController.getAll);
router.post('/create', unitController.createUnit);
router.get('/:unitId', unitController.getById);
router.patch('/:unitId/add-users', unitController.addUsersToUnit);
router.patch('/:unitId/update', unitController.updateUnit);
router.delete('/:unitId', unitController.removeUnit);

export default router;
