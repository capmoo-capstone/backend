import { Router } from 'express';
import * as projectController from '../controllers/project.controller';

const router = Router();

router.get('/', projectController.getAll);
router.get('/unassigned/:unitId', projectController.getUnassigned);
router.get('/assigned/:unitId', projectController.getAssignedProjectsByUnit);
router.post('/create', projectController.createProject);
router.get('/:projectId', projectController.getById);
router.patch('/:projectId/update', projectController.updateProject);
router.patch('/assign', projectController.assignProject);
router.patch('/:projectId/claim', projectController.claimProject);
router.patch('/:projectId/accept', projectController.acceptProject);
router.patch('/:projectId/cancel', projectController.cancelProject);
router.delete('/:projectId', projectController.removeProject);

export default router;
