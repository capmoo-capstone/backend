import { Router } from 'express';
import * as controller from '../controllers/submission.controller';
import { requireSupplyRoles } from '../middlewares/auth';
import { UserRole } from '@prisma/client';

const { GENERAL_STAFF, HEAD_OF_UNIT, DOCUMENT_STAFF } = UserRole;

const router = Router();

router.get('/:projectId', controller.getProjectSubmissions);

router.post(
  '/',
  requireSupplyRoles([GENERAL_STAFF]),
  controller.createStaffSubmission
);

router.patch(
  '/:id/approve',
  requireSupplyRoles([HEAD_OF_UNIT]),
  controller.approveSubmission
);
router.patch(
  '/:id/propose',
  requireSupplyRoles([DOCUMENT_STAFF]),
  controller.proposeSubmission
);
router.patch(
  '/:id/sign',
  requireSupplyRoles([DOCUMENT_STAFF]),
  controller.signAndCompleteSubmission
);
router.patch(
  '/:id/reject',
  requireSupplyRoles([HEAD_OF_UNIT]),
  controller.rejectSubmission
);

export default router;
