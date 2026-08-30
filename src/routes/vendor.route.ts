import { Router } from 'express';
import {
  createVendorSubmission,
  getVendorSubmissions,
} from '../controllers/submission.controller';
import { protect, requireSupplyAccess } from '../middlewares/auth';
import { publicWriteLimiter } from '../middlewares/rate-limit';
import { vendorPresignUpload } from '../controllers/storage.controller';

const router = Router();

router.post('/presign-upload', publicWriteLimiter, vendorPresignUpload);
router.post('/', publicWriteLimiter, createVendorSubmission);
router.get('/', protect, requireSupplyAccess, getVendorSubmissions);

export default router;
