import { Router } from 'express';
import * as controller from '../controllers/auth.controller';
import { protect, requireSupplyRoles } from '../middlewares/auth';
import { authLimiter } from '../middlewares/rate-limit';
import { UserRole } from '@prisma/client';

const router = Router();

router.get('/saml/metadata', controller.samlMetadata);
router.get('/saml/login', controller.startSamlLogin);
router.post('/saml/acs', controller.samlAcs);
router.post('/saml/exchange', authLimiter, controller.exchangeSsoCode);
router.post('/create-request', authLimiter, controller.requestAccount);
router.get(
  '/requests',
  protect,
  requireSupplyRoles([UserRole.ADMIN]),
  controller.listRegistrationRequests
);
router.patch(
  '/requests/:id/approve',
  protect,
  requireSupplyRoles([UserRole.ADMIN]),
  controller.approveRegistrationRequest
);
router.patch(
  '/requests/:id/reject',
  protect,
  requireSupplyRoles([UserRole.ADMIN]),
  controller.rejectRegistrationRequest
);
router.post('/login', authLimiter, controller.login);
router.get('/me', protect, controller.getMe);
router.patch('/logout', protect, controller.logout);

export default router;
