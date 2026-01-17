import { Router } from 'express';
import * as projectController from '../controllers/project.controller';

const router = Router();

router.get('/', projectController.getAll);
router.get('/unassigned', projectController.getUnassigned);
router.post('/create', projectController.createProject);
router.get('/:projectId', projectController.getById);
router.patch('/:projectId/update', projectController.updateProject);
router.patch('/:projectId/assign', projectController.assignProject);
router.patch('/:projectId/accept', projectController.acceptProject);
router.patch('/:projectId/reject', projectController.rejectProject);

export default router;
