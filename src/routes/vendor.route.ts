import { Router } from 'express';
import {
  createVendorSubmission,
  getVendorSubmissions,
} from '../controllers/submission.controller';
import {
  protect,
  requireSupplyAccess,
  requireSupplyRoles,
} from '../middlewares/auth';
import { UserRole } from '@prisma/client';

const { HEAD_OF_UNIT, GENERAL_STAFF } = UserRole;

const router = Router();

router.post('/', createVendorSubmission);
router.get('/vendors', protect, requireSupplyAccess, getVendorSubmissions);

export default router;
