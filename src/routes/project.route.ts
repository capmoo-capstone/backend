import { Router } from 'express';
import * as controller from '../controllers/project.controller';

const router = Router();

router.post('/', controller.getAll);
router.get('/unassigned', controller.getUnassignedByUnit);
router.get('/assigned', controller.getAssignedProjects);
router.get('/waiting-cancel', controller.getWaitingCancellation);
router.get('/own', controller.getOwnProjects);
router.get('/workload', controller.getWorkload);
router.get('/summary', controller.getSummary);
router.post('/create', controller.createProject);
router.post('/import', controller.importProjects);
router.patch('/assign', controller.assignProjects);
router.patch('/accept', controller.acceptProjects);
router.get('/:id', controller.getById);
router.patch('/:id/return', controller.returnProject);
router.patch('/:id/change-assignee', controller.changeAssignee);
router.patch('/:id/add-assignee', controller.addAssignee);
router.patch('/:id/claim', controller.claimProject);
router.patch('/:id/cancel', controller.cancelProject);
router.patch('/:id/approve-cancel', controller.approveCancellation);
router.patch('/:id/reject-cancel', controller.rejectCancellation);
router.patch('/:id/complete-procurement', controller.completeProcurement);
router.patch('/:id/close', controller.closeProject);
router.patch('/:id/request-edit', controller.requestEditProject);
router.patch('/:id/update', controller.updateProject);
router.delete('/:id', controller.removeProject);

export default router;
