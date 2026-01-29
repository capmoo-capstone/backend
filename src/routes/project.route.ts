import { Router } from 'express';
import * as projectController from '../controllers/project.controller';

const router = Router();

router.get('/', projectController.getAll);
router.get('/unassigned/:unitId', projectController.getUnassignedByUnit);
router.get('/assigned', projectController.getAssignedProjects);
router.post('/create', projectController.createProject);
router.patch('/assign', projectController.assignProjects);
router.patch('/accept', projectController.acceptProjects);
router.patch('/:id/change-assignee', projectController.changeAssignee);
router.patch('/:id/claim', projectController.claimProject);
router.patch('/:id/cancel', projectController.cancelProject);
router.patch('/:id/update', projectController.updateProject);
router.get('/:id', projectController.getById);
router.delete('/:id', projectController.removeProject);

export default router;
