import { Router } from 'express';
import * as controller from '../controllers/user.controller';

const router = Router();

router.get('/', controller.getAll);
router.patch('/add-unit/:unitId', controller.addUsersToUnit);
router.get('/:id', controller.getById);
router.patch('/:id/role', controller.updateRole);
router.patch('/:id/rep/:unitId', controller.addRepresentativeToUnit);
router.delete('/:id', controller.removeUser);

export default router;
