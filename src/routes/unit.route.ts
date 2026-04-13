import { Router } from 'express';
import * as controller from '../controllers/unit.controller';

const router = Router();

router.get('/', controller.getAll);
router.post('/create', controller.createUnit);
router.get('/:id', controller.getById);
router.get('/:id/rep', controller.getRepresentative);
router.patch('/:id/users', controller.updateUnitUsers);
router.patch('/:id/rep', controller.updateRepresentative);
router.patch('/:id/update', controller.updateUnit);
router.delete('/:id', controller.removeUnit);

export default router;
