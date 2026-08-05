import { Router } from 'express';
import * as controller from '../controllers/auth.controller';
import { protect } from '../middlewares/auth';

const router = Router();

router.get('/saml/metadata', controller.samlMetadata);
router.get('/saml/login', controller.startSamlLogin);
router.post('/saml/acs', controller.samlAcs);
router.post('/register', controller.register);
router.post('/login', controller.login);
router.get('/me', protect, controller.getMe);
router.patch('/logout', protect, controller.logout);

export default router;
