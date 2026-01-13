import { Router } from 'express';
import * as projectController from '../controllers/project.controller';

const router = Router();

router.get('/', projectController.getAll);
router.get('/unassigned', projectController.getUnassigned);
router.post('/create', projectController.createProject);
router.post('/:projectId/assign', projectController.assignProject);
router.post('/:projectId/accept', projectController.acceptProject);
router.post('/:projectId/reject', projectController.rejectProject);

export default router;
