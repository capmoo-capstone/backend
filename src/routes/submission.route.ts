import { Router } from 'express';
import * as submissionController from '../controllers/submission.controller';

const router = Router();

router.get('/:projectId', submissionController.getProjectSubmissions);
router.post('/', submissionController.createSubmission);
router.patch('/:id/:action', submissionController.handleSubmissionAction);

export default router;
