import { Router } from 'express';
import { UserRole } from '@prisma/client';
import * as controller from '../controllers/project.controller';
import { requireSupplyRoles } from '../middlewares/auth';

const router = Router();

router.get(
  '/',
  requireSupplyRoles([
    UserRole.GENERAL_STAFF,
    UserRole.HEAD_OF_UNIT,
    UserRole.HEAD_OF_DEPARTMENT,
    UserRole.FINANCE_STAFF,
  ]),
  controller.getFinanceExportRequest
);

router.patch(
  '/export',
  requireSupplyRoles([UserRole.FINANCE_STAFF]),
  controller.exportFinanceData
);

router.patch(
  '/:id/request-edit',
  requireSupplyRoles([UserRole.FINANCE_STAFF]),
  controller.requestEditInstallment
);

export default router;
