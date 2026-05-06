import { Router } from 'express';
import * as controller from '../controllers/project.controller';
import {
  requireRoles,
  requireSuperAdmin,
  requireSupplyAccess,
  requireSupplyRoles,
} from '../middlewares/auth';
import { UserRole } from '@prisma/client';

const router = Router();

const {
  HEAD_OF_UNIT,
  HEAD_OF_DEPARTMENT,
  ADMIN,
  GENERAL_STAFF,
  REPRESENTATIVE,
  DOCUMENT_STAFF,
  FINANCE_STAFF,
} = UserRole;

// ── List / Summary ────────────────────────────────────────────────────────────
router.post('/', controller.getAll);
router.get('/summary', controller.getSummary);

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
router.get('/own', requireSupplyAccess, controller.getOwnProjects);
router.get(
  '/workload',
  requireSupplyRoles([HEAD_OF_DEPARTMENT, HEAD_OF_UNIT]),
  controller.getWorkload
);

// ── Create / Import ───────────────────────────────────────────────────────────
router.post(
  '/create',
  requireRoles([REPRESENTATIVE, DOCUMENT_STAFF]),
  controller.createProject
);
router.post(
  '/import',
  requireSupplyRoles([DOCUMENT_STAFF]),
  controller.importProjects
);

// ── Assignment ────────────────────────────────────────────────────────────────
router.patch(
  '/assign',
  requireSupplyRoles([HEAD_OF_UNIT]),
  controller.assignProjects
);
router.patch(
  '/accept',
  requireSupplyRoles([GENERAL_STAFF]),
  controller.acceptProjects
);

// ── Contract Number ───────────────────────────────────────────────────────────
router.post(
  '/contract/new',
  requireSupplyAccess,
  controller.getNewContractNumber
);

router.patch(
  '/contract/:contractId/cancel',
  requireSupplyAccess,
  controller.cancelContractNumber
);

// ── Single project ────────────────────────────────────────────────────────────
router.get('/:id', controller.getById);

router.patch(
  '/:id/claim',
  requireSupplyRoles([GENERAL_STAFF]),
  controller.claimProject
);
router.patch(
  '/:id/change-assignee',
  requireSupplyRoles([HEAD_OF_UNIT]),
  controller.changeAssignee
);
router.patch(
  '/:id/add-assignee',
  requireSupplyRoles([GENERAL_STAFF, HEAD_OF_UNIT, ADMIN]),
  controller.addAssignee
);
router.patch(
  '/:id/return',
  requireSupplyRoles([GENERAL_STAFF]),
  controller.returnProject
);

router.patch(
  '/:id/cancel',
  requireSupplyRoles([
    GENERAL_STAFF,
    DOCUMENT_STAFF,
    HEAD_OF_UNIT,
    HEAD_OF_DEPARTMENT,
  ]),
  controller.cancelProject
);
router.patch(
  '/:id/approve-cancel',
  requireSupplyRoles([HEAD_OF_DEPARTMENT, HEAD_OF_UNIT]),
  controller.approveCancellation
);
router.patch(
  '/:id/reject-cancel',
  requireSupplyRoles([HEAD_OF_DEPARTMENT, HEAD_OF_UNIT]),
  controller.rejectCancellation
);

router.patch(
  '/:id/complete-procurement',
  requireSupplyRoles([GENERAL_STAFF]),
  controller.completeProcurement
);
router.patch(
  '/:id/complete-contract',
  requireSupplyRoles([FINANCE_STAFF]),
  controller.completeContract
);
router.patch(
  '/:id/close',
  requireSupplyRoles([FINANCE_STAFF]),
  controller.closeProject
);

router.patch(
  '/:id/request-edit',
  requireSupplyRoles([FINANCE_STAFF]),
  controller.requestEditProject
);
router.patch(
  '/:id/update',
  requireSupplyRoles([GENERAL_STAFF, DOCUMENT_STAFF, HEAD_OF_UNIT]),
  controller.updateProject
);

router.delete('/:id', requireSuperAdmin, controller.removeProject);

export default router;
