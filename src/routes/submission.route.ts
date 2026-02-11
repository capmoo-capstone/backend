import { Router } from 'express';
import * as submissionController from '../controllers/submission.controller';

const router = Router();

router.get('/:projectId', submissionController.getProjectSubmissions);
router.post('/', submissionController.createSubmission);
router.patch('/:id/approve', submissionController.approveSubmission);
router.patch('/:id/propose', submissionController.proposeSubmission);
router.patch('/:id/sign', submissionController.signAndCompleteSubmission);
router.patch('/:id/reject', submissionController.rejectSubmission);

export default router;
