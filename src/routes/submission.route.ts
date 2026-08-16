import { Router } from 'express';
import * as controller from '../controllers/submission.controller';
import { requireCapability } from '../middlewares/auth';
import { Capability } from '../lib/access-policy';

const router = Router();

router.get('/:projectId', controller.getProjectSubmissions);

router.post(
  '/',
  requireCapability(Capability.SUBMISSION_CREATE),
  controller.createStaffSubmission
);

router.patch(
  '/:id/approve',
  requireCapability(Capability.SUBMISSION_APPROVE),
  controller.approveSubmission
);
router.patch(
  '/:id/propose',
  requireCapability(Capability.SUBMISSION_PROPOSE),
  controller.proposeSubmission
);
router.patch(
  '/:id/sign',
  requireCapability(Capability.SUBMISSION_SIGN),
  controller.signAndCompleteSubmission
);
router.patch(
  '/:id/reject',
  requireCapability(Capability.SUBMISSION_APPROVE),
  controller.rejectSubmission
);

export default router;
