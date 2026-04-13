import { Router } from 'express';
import * as controller from '../controllers/user.controller';

const router = Router();

router.get('/', controller.getAll);
router.get('/:id', controller.getById);
router.patch('/roles/supply', controller.updateSupplyRole);
router.post('/:id/role', controller.addRole);
router.patch('/:id/role/remove', controller.removeRole);
router.delete('/:id', controller.removeUser);

export default router;
