import { Router } from 'express';
import * as controller from '../controllers/submission.controller';

const router = Router();

router.get('/:projectId', controller.getProjectSubmissions);
router.post('/', controller.createSubmission);
router.patch('/:id/:action', controller.handleSubmissionAction);

export default router;
