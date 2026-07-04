import { Router } from 'express';
import * as controller from '../controllers/holiday.controller';
import { requireRoles } from '../middlewares/auth';
import { UserRole } from '@prisma/client';

const { ADMIN, SUPER_ADMIN } = UserRole;

const router = Router();

router.get('/', controller.getAll);
router.post('/calculate-timeline', controller.calculateTimeline);

router.post('/', requireRoles([ADMIN, SUPER_ADMIN]), controller.create);
router.put('/:id', requireRoles([ADMIN, SUPER_ADMIN]), controller.update);
router.delete('/:id', requireRoles([ADMIN, SUPER_ADMIN]), controller.remove);

export default router;

