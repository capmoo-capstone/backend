import { Router } from 'express';
import * as controller from '../controllers/user.controller';

const router = Router();

router.get('/', controller.getAll);
router.get('/:id', controller.getById);
router.patch('/:id/role', controller.updateRole);
router.delete('/:id', controller.removeUser);

export default router;
