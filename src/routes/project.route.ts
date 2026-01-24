import { Router } from 'express';
import * as projectController from '../controllers/project.controller';

const router = Router();

router.get('/', projectController.getAll);
router.get('/unassigned/:unitId', projectController.getUnassignedByUnit);
router.get('/assigned/:unitId', projectController.getAssignedProjectsByUnit);
router.post('/create', projectController.createProject);
router.get('/:id', projectController.getById);
router.patch('/:id/update', projectController.updateProject);
router.patch('/assign', projectController.assignProjects);
router.patch('/accept', projectController.acceptProjects);
router.patch('/:id/claim', projectController.claimProject);
router.patch('/:id/cancel', projectController.cancelProject);
router.delete('/:id', projectController.removeProject);

export default router;
