import { Router } from 'express';
import * as controller from '../controllers/project.controller';
import {
  requireRoles,
  requireCapability,
  requireSuperAdmin,
  requireSupplyAccess,
  requireSupplyRoles,
} from '../middlewares/auth';
import { UserRole } from '@prisma/client';
import { Capability } from '../lib/access-policy';

const router = Router();

const {
  HEAD_OF_UNIT,
  HEAD_OF_DEPARTMENT,
  GENERAL_STAFF,
  DOCUMENT_STAFF,
  FINANCE_STAFF,
} = UserRole;

// ── List / Summary ────────────────────────────────────────────────────────────
router.post('/', controller.getAll);
router.get('/summary', controller.getSummary);
router.get(
  '/approval-dates',
  requireSupplyAccess,
  controller.getExpectedApprovalDates
);

// ── Supply-only views ─────────────────────────────────────────────────────────
router.get(
  '/unassigned',
  requireSupplyRoles([HEAD_OF_DEPARTMENT, HEAD_OF_UNIT, GENERAL_STAFF]),
  controller.getUnassignedByUnit
);
router.get(
  '/assigned',
  requireSupplyRoles([HEAD_OF_DEPARTMENT, HEAD_OF_UNIT, GENERAL_STAFF]),
  controller.getAssignedProjects
);
router.get(
  '/waiting-cancel',
  requireSupplyRoles([HEAD_OF_DEPARTMENT, HEAD_OF_UNIT, GENERAL_STAFF]),
  controller.getWaitingCancellation
);
router.get(
  '/own/total',
  requireSupplyRoles([
    HEAD_OF_UNIT,
    GENERAL_STAFF,
    DOCUMENT_STAFF,
    FINANCE_STAFF,
  ]),
  controller.getOwnProjectsTotal
);
router.get(
  '/own',
  requireSupplyRoles([
    HEAD_OF_UNIT,
    GENERAL_STAFF,
    DOCUMENT_STAFF,
    FINANCE_STAFF,
  ]),
  controller.getOwnProjects
);
router.get(
  '/workload',
  requireSupplyRoles([HEAD_OF_DEPARTMENT, HEAD_OF_UNIT]),
  controller.getWorkload
);

// ── Create / Import ───────────────────────────────────────────────────────────
router.post(
  '/create',
  requireCapability(Capability.PROJECT_CREATE),
  controller.createProject
);
router.post(
  '/import',
  requireCapability(Capability.PROJECT_IMPORT),
  controller.importProjects
);

// ── Assignment ────────────────────────────────────────────────────────────────
router.patch(
  '/assign',
  requireCapability(Capability.PROJECT_ASSIGN),
  controller.assignProjects
);
router.patch(
  '/accept',
  requireCapability(Capability.PROJECT_ACCEPT),
  controller.acceptProjects
);

// ── Contract Number ───────────────────────────────────────────────────────────
router.post(
  '/contract/new',
  requireCapability(Capability.CONTRACT_MANAGE),
  controller.getNewContractNumber
);

router.patch(
  '/contract/:contractId/cancel',
  requireCapability(Capability.CONTRACT_MANAGE),
  controller.cancelContractNumber
);

// ── Single project ────────────────────────────────────────────────────────────
router.get('/:id/history', controller.getProjectHistory);
router.get('/:id/document-summary', controller.getDocumentSummary);
router.get('/:id', controller.getById);

router.patch(
  '/:id/claim',
  requireCapability(Capability.PROJECT_CLAIM),
  controller.claimProject
);
router.patch(
  '/:id/change-assignee',
  requireCapability(Capability.PROJECT_CHANGE_ASSIGNEE),
  controller.changeAssignee
);
router.patch(
  '/:id/add-assignee',
  requireCapability(Capability.PROJECT_ADD_ASSIGNEE),
  controller.addAssignee
);
router.patch(
  '/:id/return',
  requireCapability(Capability.PROJECT_RETURN),
  controller.returnProject
);

router.patch(
  '/:id/cancel',
  requireCapability(Capability.PROJECT_CANCEL),
  controller.cancelProject
);
router.patch(
  '/:id/approve-cancel',
  requireCapability(Capability.PROJECT_APPROVE_CANCELLATION),
  controller.approveCancellation
);
router.patch(
  '/:id/reject-cancel',
  requireCapability(Capability.PROJECT_APPROVE_CANCELLATION),
  controller.rejectCancellation
);

router.patch(
  '/:id/complete-procurement',
  requireCapability(Capability.PROJECT_COMPLETE_PROCUREMENT),
  controller.completeProcurement
);

router.post(
  '/:id/complete-installment/:installmentNo',
  requireCapability(Capability.INSTALLMENT_CREATE),
  controller.completeInstallment
);

router.patch(
  '/:id/close',
  requireCapability(Capability.PROJECT_CLOSE),
  controller.closeProject
);

router.patch(
  '/:id/update',
  requireCapability(Capability.PROJECT_UPDATE),
  controller.updateProject
);

router.delete(
  '/:id',
  requireCapability(Capability.PROJECT_DELETE),
  controller.removeProject
);

export default router;
