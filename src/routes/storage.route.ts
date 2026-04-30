import { Router } from 'express';
import * as controller from '../controllers/storage.controller';
import { requireSuperAdmin } from '../middlewares/auth';

const router = Router();

router.post('/presign-upload', controller.presignUpload);
router.post('/presign-download', controller.presignDownload);
router.delete('/delete', requireSuperAdmin, controller.deleteFile);

export default router;
