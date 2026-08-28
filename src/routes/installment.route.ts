import { Router } from 'express';
import { UserRole } from '@prisma/client';
import * as controller from '../controllers/project.controller';
import { requireSupplyRoles } from '../middlewares/auth';
import { requireCapability } from '../middlewares/auth';
import { Capability } from '../utils/access-policy';

const router = Router();

router.get(
  '/',
  requireSupplyRoles([
    UserRole.GENERAL_STAFF,
    UserRole.HEAD_OF_UNIT,
    UserRole.HEAD_OF_DEPARTMENT,
    UserRole.FINANCE_STAFF,
  ]),
  controller.getInstallments
);

router.patch(
  '/export',
  requireCapability(Capability.INSTALLMENT_EXPORT),
  controller.exportInstallments
);

router.patch(
  '/:id/request-edit',
  requireCapability(Capability.INSTALLMENT_REQUEST_EDIT),
  controller.requestEditInstallment
);

export default router;
