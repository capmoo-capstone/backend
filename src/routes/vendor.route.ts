import { Router } from 'express';
import {
  createVendorSubmission,
  getVendorSubmissions,
} from '../controllers/submission.controller';
import { protect, requireSupplyAccess } from '../middlewares/auth';
const router = Router();

router.post('/', createVendorSubmission);
router.get('/', protect, requireSupplyAccess, getVendorSubmissions);

export default router;
