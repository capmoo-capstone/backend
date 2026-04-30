import { Router } from 'express';
import {
  createVendorSubmission,
  getVendorSubmissions,
} from '../controllers/submission.controller';
import { protect, requireSupplyAccess } from '../middlewares/auth';
import { vendorPresignUpload } from '../controllers/storage.controller';

const router = Router();

router.post('/presign-upload', vendorPresignUpload);
router.post('/', createVendorSubmission);
router.get('/', protect, requireSupplyAccess, getVendorSubmissions);

export default router;
