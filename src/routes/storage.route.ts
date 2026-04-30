import { Router } from 'express';
import {
  presignUpload,
  presignDownload,
} from '../controllers/storage.controller';

const router = Router();

router.post('/presign-upload', presignUpload);
router.post('/presign-download', presignDownload);

export default router;
