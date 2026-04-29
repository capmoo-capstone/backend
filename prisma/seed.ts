import {
  LogActionType,
  ProcurementType,
  ProjectPhaseStatus,
  ProjectStatus,
  SubmissionStatus,
  SubmissionType,
  UnitResponsibleType,
  UserRole,
  UrgentType,
} from '@prisma/client';
import { prisma } from '../src/config/prisma';
import { WORKFLOW_STEP_ORDERS } from '../src/lib/constant';
import { syncProjectPhases } from '../src/lib/phase-status';

const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date();

const daysFromNow = (days: number) => new Date(now.getTime() + days * DAY_MS);

const fiscalYear = (date = now) => {
  const thaiYear = date.getFullYear() + 543;
  return date.getMonth() + 1 >= 10 ? thaiYear + 1 : thaiYear;
};

const ids = {
  users: {
    superAdmin: '00000000-0000-4000-8000-000000000001',
    admin: '00000000-0000-4000-8000-000000000002',
    supplyHead: '00000000-0000-4000-8000-000000000003',
    procHeadLt: '00000000-0000-4000-8000-000000000004',
    procHeadHigh: '00000000-0000-4000-8000-000000000005',
    contractHead: '00000000-0000-4000-8000-000000000006',
    procurementLt: '00000000-0000-4000-8000-000000000007',
    procurementHigh: '00000000-0000-4000-8000-000000000008',
    contractStaff: '00000000-0000-4000-8000-000000000009',
    financeStaff: '00000000-0000-4000-8000-000000000010',
    documentStaff: '00000000-0000-4000-8000-000000000011',
    facilitiesRep: '00000000-0000-4000-8000-000000000012',
    maintenanceRep: '00000000-0000-4000-8000-000000000013',
    itRep: '00000000-0000-4000-8000-000000000014',
    libraryStaff: '00000000-0000-4000-8000-000000000015',
    delegatedStaff: '00000000-0000-4000-8000-000000000016',
    guest: '00000000-0000-4000-8000-000000000017',
  },
  projects: {
    unassigned: '10000000-0000-4000-8000-000000000001',
    waitingAccept: '10000000-0000-4000-8000-000000000002',
    waitingApproval: '10000000-0000-4000-8000-000000000003',
    waitingProposal: '10000000-0000-4000-8000-000000000004',
    procurementComplete: '10000000-0000-4000-8000-000000000005',
    contractActive: '10000000-0000-4000-8000-000000000006',
    contractReadyExport: '10000000-0000-4000-8000-000000000007',
    closed: '10000000-0000-4000-8000-000000000008',
    waitingCancel: '10000000-0000-4000-8000-000000000009',
    cancelled: '10000000-0000-4000-8000-000000000010',
    requestEdit: '10000000-0000-4000-8000-000000000011',
    internal: '10000000-0000-4000-8000-000000000012',
  },
};

const workflowUnitByProcurement: Record<ProcurementType, string> = {
  [ProcurementType.LT100K]: 'UNIT-PROC-1',
  [ProcurementType.LT500K]: 'UNIT-PROC-1',
  [ProcurementType.MT500K]: 'UNIT-PROC-2',
  [ProcurementType.SELECTION]: 'UNIT-PROC-2',
  [ProcurementType.EBIDDING]: 'UNIT-PROC-2',
  [ProcurementType.INTERNAL]: 'UNIT-PROC-2',
};

const cleanup = async () => {
  await prisma.projectDocument.deleteMany();
  await prisma.projectSubmission.deleteMany();
  await prisma.projectCancellation.deleteMany();
  await prisma.projectHistory.deleteMany();
  await prisma.budgetPlan.deleteMany();
  await prisma.project.deleteMany();
  await prisma.userDelegation.deleteMany();
  await prisma.userOrganizationRole.deleteMany();
  await prisma.user.deleteMany();
  await prisma.unit.deleteMany();
  await prisma.department.deleteMany();
};

const seedOrganization = async () => {
  await prisma.department.createMany({
    data: [
      { id: 'DEPT-SUP-OPS', name: 'Supply Operation' },
      { id: 'DEPT-FIN', name: 'สำนักงานบริหารการเงิน การบัญชี และการพัสดุ' },
      { id: 'DEPT-REG', name: 'สำนักงานทะเบียน' },
      { id: 'DEPT-LOC', name: 'สำนักงานบริหารระบบกายภาพ' },
      { id: 'DEPT-STUAFF', name: 'สำนักงานบริหารกิจการนิสิต' },
    ],
  });

  await prisma.unit.createMany({
    data: [
      {
        id: 'UNIT-PROC-1',
        dept_id: 'DEPT-SUP-OPS',
        name: 'กลุ่มงานจัดซื้อจัดจ้าง 1',
        type: [UnitResponsibleType.LT100K, UnitResponsibleType.LT500K],
      },
      {
        id: 'UNIT-PROC-2',
        dept_id: 'DEPT-SUP-OPS',
        name: 'กลุ่มงานจัดซื้อจัดจ้าง 2',
        type: [
          UnitResponsibleType.MT500K,
          UnitResponsibleType.SELECTION,
          UnitResponsibleType.EBIDDING,
          UnitResponsibleType.INTERNAL,
        ],
      },
      {
        id: 'UNIT-CONT',
        dept_id: 'DEPT-SUP-OPS',
        name: 'กลุ่มงานบริหารสัญญา',
        type: [UnitResponsibleType.CONTRACT],
      },
      {
        id: 'UNIT-FIN',
        dept_id: 'DEPT-FIN',
        name: 'ฝ่ายการเงิน',
        type: [],
      },
      {
        id: 'UNIT-ACC',
        dept_id: 'DEPT-FIN',
        name: 'ฝ่ายการบัญชี',
        type: [],
      },
      {
        id: 'UNIT-SUP',
        dept_id: 'DEPT-FIN',
        name: 'ฝ่ายการพัสดุ',
        type: [],
      },
      {
        id: 'UNIT-BUILD',
        dept_id: 'DEPT-LOC',
        name: 'ฝ่ายอาคารสถานที่',
        type: [],
      },
      {
        id: 'UNIT-MAINT',
        dept_id: 'DEPT-LOC',
        name: 'ฝ่ายซ่อมบำรุง',
        type: [],
      },
      {
        id: 'UNIT-EDU',
        dept_id: 'DEPT-STUAFF',
        name: 'ฝ่ายทุนการศึกษาและบริการนิสิต',
        type: [],
      },
      {
        id: 'UNIT-NET',
        dept_id: 'DEPT-STUAFF',
        name: 'ฝ่ายประสานงานและเครือข่ายกิจการนิสิต',
        type: [],
      },
    ],
  });
};

const seedUsers = async () => {
  await prisma.user.createMany({
    data: [
      {
        id: ids.users.superAdmin,
        username: 'super_admin',
        email: 'super_admin@example.test',
        full_name: 'Super Admin',
      },
      {
        id: ids.users.admin,
        username: 'admin',
        email: 'admin@example.test',
        full_name: 'Admin',
      },
      {
        id: ids.users.supplyHead,
        username: 'supply_head',
        email: 'supply_head@example.test',
        full_name: 'Supply Head',
      },
      {
        id: ids.users.procHeadLt,
        username: 'proc_head1',
        email: 'proc_head1@example.test',
        full_name: 'Procurement Head1',
      },
      {
        id: ids.users.procHeadHigh,
        username: 'proc_head2',
        email: 'proc_head2@example.test',
        full_name: 'Procurement Head2',
      },
      {
        id: ids.users.contractHead,
        username: 'contract_head',
        email: 'contract_head@example.test',
        full_name: 'Contract Head',
      },
      {
        id: ids.users.procurementLt,
        username: 'procurement1',
        email: 'procurement1@example.test',
        full_name: 'Procurement1',
      },
      {
        id: ids.users.procurementHigh,
        username: 'procurement2',
        email: 'procurement2@example.test',
        full_name: 'Procurement2',
      },
      {
        id: ids.users.contractStaff,
        username: 'contract',
        email: 'contract@example.test',
        full_name: 'Contract',
      },
      {
        id: ids.users.financeStaff,
        username: 'finance_staff',
        email: 'finance_staff@example.test',
        full_name: 'Finance Staff',
      },
      {
        id: ids.users.documentStaff,
        username: 'document_staff',
        email: 'document_staff@example.test',
        full_name: 'Document Staff',
      },
      {
        id: ids.users.facilitiesRep,
        username: 'facilities_rep',
        email: 'facilities_rep@example.test',
        full_name: 'Facilities Rep',
      },
      {
        id: ids.users.maintenanceRep,
        username: 'maintenance_rep',
        email: 'maintenance_rep@example.test',
        full_name: 'Maintenance Rep',
      },
      {
        id: ids.users.itRep,
        username: 'registration_staff',
        email: 'registration_staff@example.test',
        full_name: 'Registration Staff',
      },
      {
        id: ids.users.libraryStaff,
        username: 'student_affairs_staff',
        email: 'student_affairs_staff@example.test',
        full_name: 'Student Affairs Staff',
      },
      {
        id: ids.users.delegatedStaff,
        username: 'delegated_staff',
        email: 'delegated_staff@example.test',
        full_name: 'Delegated Staff',
      },
      {
        id: ids.users.guest,
        username: 'guest',
        email: 'guest@example.test',
        full_name: 'Guest',
      },
    ],
  });

  await prisma.userOrganizationRole.createMany({
    data: [
      {
        user_id: ids.users.superAdmin,
        role: UserRole.SUPER_ADMIN,
        dept_id: 'DEPT-SUP-OPS',
      },
      {
        user_id: ids.users.admin,
        role: UserRole.ADMIN,
        dept_id: 'DEPT-SUP-OPS',
      },
      {
        user_id: ids.users.supplyHead,
        role: UserRole.HEAD_OF_DEPARTMENT,
        dept_id: 'DEPT-SUP-OPS',
      },
      {
        user_id: ids.users.procHeadLt,
        role: UserRole.HEAD_OF_UNIT,
        dept_id: 'DEPT-SUP-OPS',
        unit_id: 'UNIT-PROC-1',
      },
      {
        user_id: ids.users.procHeadHigh,
        role: UserRole.HEAD_OF_UNIT,
        dept_id: 'DEPT-SUP-OPS',
        unit_id: 'UNIT-PROC-2',
      },
      {
        user_id: ids.users.contractHead,
        role: UserRole.HEAD_OF_UNIT,
        dept_id: 'DEPT-SUP-OPS',
        unit_id: 'UNIT-CONT',
      },
      {
        user_id: ids.users.procurementLt,
        role: UserRole.GENERAL_STAFF,
        dept_id: 'DEPT-SUP-OPS',
        unit_id: 'UNIT-PROC-1',
      },
      {
        user_id: ids.users.procurementHigh,
        role: UserRole.GENERAL_STAFF,
        dept_id: 'DEPT-SUP-OPS',
        unit_id: 'UNIT-PROC-2',
      },
      {
        user_id: ids.users.contractStaff,
        role: UserRole.GENERAL_STAFF,
        dept_id: 'DEPT-SUP-OPS',
        unit_id: 'UNIT-CONT',
      },
      {
        user_id: ids.users.financeStaff,
        role: UserRole.FINANCE_STAFF,
        dept_id: 'DEPT-SUP-OPS',
      },
      {
        user_id: ids.users.documentStaff,
        role: UserRole.DOCUMENT_STAFF,
        dept_id: 'DEPT-SUP-OPS',
      },
      {
        user_id: ids.users.facilitiesRep,
        role: UserRole.REPRESENTATIVE,
        dept_id: 'DEPT-LOC',
        unit_id: 'UNIT-BUILD',
      },
      {
        user_id: ids.users.maintenanceRep,
        role: UserRole.REPRESENTATIVE,
        dept_id: 'DEPT-LOC',
        unit_id: 'UNIT-MAINT',
      },
      {
        user_id: ids.users.itRep,
        role: UserRole.GUEST,
        dept_id: 'DEPT-REG',
      },
      {
        user_id: ids.users.libraryStaff,
        role: UserRole.REPRESENTATIVE,
        dept_id: 'DEPT-STUAFF',
        unit_id: 'UNIT-EDU',
      },
      {
        user_id: ids.users.libraryStaff,
        role: UserRole.REPRESENTATIVE,
        dept_id: 'DEPT-STUAFF',
        unit_id: 'UNIT-NET',
      },
      {
        user_id: ids.users.delegatedStaff,
        role: UserRole.GENERAL_STAFF,
        dept_id: 'DEPT-SUP-OPS',
        unit_id: 'UNIT-PROC-1',
      },
      {
        user_id: ids.users.admin,
        role: UserRole.GUEST,
        dept_id: 'DEPT-FIN',
        unit_id: 'UNIT-SUP',
      },
      {
        user_id: ids.users.supplyHead,
        role: UserRole.GUEST,
        dept_id: 'DEPT-FIN',
        unit_id: 'UNIT-SUP',
      },
      {
        user_id: ids.users.procHeadLt,
        role: UserRole.GUEST,
        dept_id: 'DEPT-FIN',
        unit_id: 'UNIT-SUP',
      },
      {
        user_id: ids.users.procHeadHigh,
        role: UserRole.GUEST,
        dept_id: 'DEPT-FIN',
        unit_id: 'UNIT-SUP',
      },
      {
        user_id: ids.users.contractHead,
        role: UserRole.GUEST,
        dept_id: 'DEPT-FIN',
        unit_id: 'UNIT-SUP',
      },
      {
        user_id: ids.users.procurementLt,
        role: UserRole.GUEST,
        dept_id: 'DEPT-FIN',
        unit_id: 'UNIT-SUP',
      },
      {
        user_id: ids.users.procurementHigh,
        role: UserRole.GUEST,
        dept_id: 'DEPT-FIN',
        unit_id: 'UNIT-SUP',
      },
      {
        user_id: ids.users.contractStaff,
        role: UserRole.GUEST,
        dept_id: 'DEPT-FIN',
        unit_id: 'UNIT-SUP',
      },
      {
        user_id: ids.users.financeStaff,
        role: UserRole.GUEST,
        dept_id: 'DEPT-FIN',
        unit_id: 'UNIT-SUP',
      },
      {
        user_id: ids.users.documentStaff,
        role: UserRole.GUEST,
        dept_id: 'DEPT-FIN',
        unit_id: 'UNIT-SUP',
      },
      {
        user_id: ids.users.delegatedStaff,
        role: UserRole.GUEST,
        dept_id: 'DEPT-FIN',
        unit_id: 'UNIT-SUP',
      },
      {
        user_id: ids.users.guest,
        role: UserRole.GUEST,
        dept_id: 'DEPT-REG',
      },
    ],
  });

  await prisma.userDelegation.create({
    data: {
      delegator_id: ids.users.procHeadLt,
      delegatee_id: ids.users.delegatedStaff,
      start_date: daysFromNow(-1),
      end_date: daysFromNow(14),
      is_active: true,
    },
  });
};

const createProject = async (data: {
  id: string;
  receiveSuffix: number;
  title: string;
  description: string;
  budget: number;
  status: ProjectStatus;
  procurementType: ProcurementType;
  workflowType?: UnitResponsibleType;
  requestingDeptId: string;
  requestingUnitId?: string | null;
  createdBy: string;
  urgent?: UrgentType;
  expectedApprovalDays?: number;
  expectedCompletionDays?: number;
  procurementStatus?: ProjectPhaseStatus;
  procurementStep?: number | null;
  contractStatus?: ProjectPhaseStatus;
  contractStep?: number | null;
  prNo?: string;
  poNo?: string;
  lessNo?: string;
  contractNo?: string;
  migoNo?: string;
  vendorName?: string;
  vendorEmail?: string;
  requestEditReason?: string;
  procurementAssigneeIds?: string[];
  contractAssigneeIds?: string[];
}) => {
  const workflowType = data.workflowType ?? data.procurementType;
  const responsibleUnitId =
    workflowType === UnitResponsibleType.CONTRACT
      ? 'UNIT-CONT'
      : workflowUnitByProcurement[data.procurementType];

  return await prisma.project.create({
    data: {
      id: data.id,
      receive_no: `${fiscalYear()}/${data.receiveSuffix
        .toString()
        .padStart(5, '0')}`,
      title: data.title,
      description: data.description,
      budget: data.budget,
      status: data.status,
      procurement_type: data.procurementType,
      current_workflow_type: workflowType,
      responsible_unit_id: responsibleUnitId,
      requesting_dept_id: data.requestingDeptId,
      requesting_unit_id: data.requestingUnitId ?? null,
      created_by: data.createdBy,
      is_urgent: data.urgent ?? UrgentType.NORMAL,
      expected_approval_date:
        data.expectedApprovalDays === undefined
          ? null
          : daysFromNow(data.expectedApprovalDays),
      expected_completion_procurement_date:
        data.expectedCompletionDays === undefined
          ? null
          : daysFromNow(data.expectedCompletionDays),
      procurement_status:
        data.procurementStatus ?? ProjectPhaseStatus.NOT_STARTED,
      procurement_step: data.procurementStep ?? null,
      contract_status: data.contractStatus ?? ProjectPhaseStatus.NOT_STARTED,
      contract_step: data.contractStep ?? null,
      pr_no: data.prNo,
      po_no: data.poNo,
      less_no: data.lessNo,
      contract_no: data.contractNo,
      migo_no: data.migoNo,
      vendor_name: data.vendorName,
      vendor_email: data.vendorEmail,
      request_edit_reason: data.requestEditReason,
      assignee_procurement:
        data.procurementAssigneeIds && data.procurementAssigneeIds.length > 0
          ? {
              connect: data.procurementAssigneeIds.map((id) => ({ id })),
            }
          : undefined,
      assignee_contract:
        data.contractAssigneeIds && data.contractAssigneeIds.length > 0
          ? {
              connect: data.contractAssigneeIds.map((id) => ({ id })),
            }
          : undefined,
    },
  });
};

const createSubmission = async (data: {
  projectId: string;
  workflowType: UnitResponsibleType;
  stepOrder: number;
  status: SubmissionStatus;
  submittedBy?: string | null;
  approvedBy?: string | null;
  proposedBy?: string | null;
  completedBy?: string | null;
  submittedDaysAgo?: number;
  submissionType?: SubmissionType;
  poNo?: string;
  comment?: string;
  fieldKey?: string;
  fileName?: string;
}) => {
  const submittedAt = daysFromNow(-(data.submittedDaysAgo ?? data.stepOrder));

  return await prisma.projectSubmission.create({
    data: {
      project_id: data.projectId,
      workflow_type: data.workflowType,
      step_order: data.stepOrder,
      submission_type: data.submissionType ?? SubmissionType.STAFF,
      submission_round: 1,
      po_no: data.poNo,
      status: data.status,
      submitted_by: data.submittedBy ?? null,
      submitted_at: submittedAt,
      approved_by: data.approvedBy ?? null,
      approved_at: data.approvedBy ? daysFromNow(-1) : null,
      proposing_by: data.proposedBy ?? null,
      proposing_at: data.proposedBy ? daysFromNow(-1) : null,
      completed_by: data.completedBy ?? null,
      completed_at: data.completedBy ? daysFromNow(-1) : null,
      comment: data.comment,
      meta_data: [
        {
          seeded_for: 'user-testing',
          workflow_type: data.workflowType,
          step_order: data.stepOrder,
        },
      ],
      documents: {
        create: [
          {
            field_key: data.fieldKey ?? `step_${data.stepOrder}`,
            file_name:
              data.fileName ??
              `ut_${data.workflowType.toLowerCase()}_step_${data.stepOrder}.pdf`,
            file_path: `/uploads/user-testing/${data.projectId}/${data.workflowType}/step_${data.stepOrder}.pdf`,
          },
        ],
      },
    },
  });
};

const seedCompletedSteps = async (
  projectId: string,
  workflowType: UnitResponsibleType,
  submitterId: string,
  completedById: string,
  count: number
) => {
  const steps = WORKFLOW_STEP_ORDERS[workflowType].slice(0, count);
  const approverId =
    workflowType === UnitResponsibleType.CONTRACT
      ? ids.users.contractHead
      : workflowType === UnitResponsibleType.LT100K ||
          workflowType === UnitResponsibleType.LT500K
        ? ids.users.procHeadLt
        : ids.users.procHeadHigh;

  for (const stepOrder of steps) {
    await createSubmission({
      projectId,
      workflowType,
      stepOrder,
      status: SubmissionStatus.COMPLETED,
      submittedBy: submitterId,
      approvedBy: approverId,
      completedBy: completedById,
      submittedDaysAgo: count - stepOrder + 2,
    });
  }
};

const seedProjects = async () => {
  const fy = fiscalYear();

  await createProject({
    id: ids.projects.unassigned,
    receiveSuffix: 90001,
    title: 'User Testing - New chairs for reading room',
    description: 'UNASSIGNED LT100K project for claim and assignment testing.',
    budget: 75000,
    status: ProjectStatus.UNASSIGNED,
    procurementType: ProcurementType.LT100K,
    requestingDeptId: 'DEPT-STUAFF',
    requestingUnitId: 'UNIT-EDU',
    createdBy: ids.users.libraryStaff,
    expectedApprovalDays: 7,
  });

  await createProject({
    id: ids.projects.waitingAccept,
    receiveSuffix: 90002,
    title: 'User Testing - Replacement laptops',
    description: 'WAITING_ACCEPT project assigned to Procurement Team 1.',
    budget: 320000,
    status: ProjectStatus.WAITING_ACCEPT,
    procurementType: ProcurementType.LT500K,
    requestingDeptId: 'DEPT-REG',
    requestingUnitId: null,
    createdBy: ids.users.itRep,
    expectedApprovalDays: 10,
    procurementAssigneeIds: [ids.users.procurementLt],
  });

  await createProject({
    id: ids.projects.waitingApproval,
    receiveSuffix: 90003,
    title: 'User Testing - Network monitoring sensors',
    description:
      'IN_PROGRESS project with a staff submission waiting approval.',
    budget: 460000,
    status: ProjectStatus.IN_PROGRESS,
    procurementType: ProcurementType.LT500K,
    requestingDeptId: 'DEPT-REG',
    requestingUnitId: null,
    createdBy: ids.users.itRep,
    urgent: UrgentType.URGENT,
    expectedApprovalDays: 3,
    procurementStatus: ProjectPhaseStatus.WAITING_APPROVAL,
    procurementStep: 2,
    procurementAssigneeIds: [ids.users.procurementLt],
  });
  await seedCompletedSteps(
    ids.projects.waitingApproval,
    UnitResponsibleType.LT500K,
    ids.users.procurementLt,
    ids.users.procurementLt,
    1
  );
  await createSubmission({
    projectId: ids.projects.waitingApproval,
    workflowType: UnitResponsibleType.LT500K,
    stepOrder: 2,
    status: SubmissionStatus.WAITING_APPROVAL,
    submittedBy: ids.users.procurementLt,
    fieldKey: 'approval_pack',
  });

  await createProject({
    id: ids.projects.waitingProposal,
    receiveSuffix: 90004,
    title: 'User Testing - Accounting software renewal',
    description:
      'IN_PROGRESS MT500K project with a submission waiting proposal/signature flow.',
    budget: 690000,
    status: ProjectStatus.IN_PROGRESS,
    procurementType: ProcurementType.MT500K,
    requestingDeptId: 'DEPT-FIN',
    requestingUnitId: 'UNIT-ACC',
    createdBy: ids.users.financeStaff,
    procurementStatus: ProjectPhaseStatus.WAITING_PROPOSAL,
    procurementStep: 3,
    prNo: `${fy}-PR-UT-90004`,
    procurementAssigneeIds: [ids.users.procurementHigh],
  });
  await seedCompletedSteps(
    ids.projects.waitingProposal,
    UnitResponsibleType.MT500K,
    ids.users.procurementHigh,
    ids.users.procurementHigh,
    2
  );
  await createSubmission({
    projectId: ids.projects.waitingProposal,
    workflowType: UnitResponsibleType.MT500K,
    stepOrder: 3,
    status: SubmissionStatus.WAITING_PROPOSAL,
    submittedBy: ids.users.procurementHigh,
    approvedBy: ids.users.procHeadHigh,
    fieldKey: 'proposal_request',
  });

  await createProject({
    id: ids.projects.procurementComplete,
    receiveSuffix: 90005,
    title: 'User Testing - Data center UPS upgrade',
    description:
      'EBIDDING project with procurement phase completed and ready to move to contract.',
    budget: 1800000,
    status: ProjectStatus.IN_PROGRESS,
    procurementType: ProcurementType.EBIDDING,
    requestingDeptId: 'DEPT-REG',
    requestingUnitId: null,
    createdBy: ids.users.itRep,
    expectedCompletionDays: 20,
    prNo: `${fy}-PR-UT-90005`,
    procurementAssigneeIds: [ids.users.procurementHigh],
  });
  await seedCompletedSteps(
    ids.projects.procurementComplete,
    UnitResponsibleType.EBIDDING,
    ids.users.procurementHigh,
    ids.users.procurementHigh,
    WORKFLOW_STEP_ORDERS[UnitResponsibleType.EBIDDING].length
  );
  await prisma.$transaction((tx) =>
    syncProjectPhases(
      tx,
      UnitResponsibleType.EBIDDING,
      ids.projects.procurementComplete
    )
  );

  await createProject({
    id: ids.projects.contractActive,
    receiveSuffix: 90006,
    title: 'User Testing - Security service contract',
    description: 'CONTRACT workflow currently in progress.',
    budget: 2400000,
    status: ProjectStatus.IN_PROGRESS,
    procurementType: ProcurementType.SELECTION,
    workflowType: UnitResponsibleType.CONTRACT,
    requestingDeptId: 'DEPT-LOC',
    requestingUnitId: 'UNIT-BUILD',
    createdBy: ids.users.facilitiesRep,
    procurementStatus: ProjectPhaseStatus.COMPLETED,
    contractStatus: ProjectPhaseStatus.IN_PROGRESS,
    contractStep: 2,
    prNo: `${fy}-PR-UT-90006`,
    poNo: `${fy}-PO-UT-90006`,
    lessNo: `${fy}-LESS-UT-90006`,
    vendorName: 'SecureWorks User Testing Co., Ltd.',
    vendorEmail: 'vendor.security@example.test',
    procurementAssigneeIds: [ids.users.procurementHigh],
    contractAssigneeIds: [ids.users.contractStaff],
  });
  await seedCompletedSteps(
    ids.projects.contractActive,
    UnitResponsibleType.CONTRACT,
    ids.users.contractStaff,
    ids.users.contractStaff,
    1
  );

  await createProject({
    id: ids.projects.contractReadyExport,
    receiveSuffix: 90007,
    title: 'User Testing - Building maintenance contract',
    description: 'CONTRACT workflow with all contract steps submitted.',
    budget: 1250000,
    status: ProjectStatus.IN_PROGRESS,
    procurementType: ProcurementType.SELECTION,
    workflowType: UnitResponsibleType.CONTRACT,
    requestingDeptId: 'DEPT-LOC',
    requestingUnitId: 'UNIT-MAINT',
    createdBy: ids.users.maintenanceRep,
    procurementStatus: ProjectPhaseStatus.COMPLETED,
    prNo: `${fy}-PR-UT-90007`,
    poNo: `${fy}-PO-UT-90007`,
    lessNo: `${fy}-LESS-UT-90007`,
    contractNo: `${fy}-CON-UT-90007`,
    vendorName: 'Maintain Plus User Testing Ltd.',
    vendorEmail: 'vendor.maintenance@example.test',
    procurementAssigneeIds: [ids.users.procurementHigh],
    contractAssigneeIds: [ids.users.contractStaff],
  });
  await seedCompletedSteps(
    ids.projects.contractReadyExport,
    UnitResponsibleType.CONTRACT,
    ids.users.contractStaff,
    ids.users.contractStaff,
    WORKFLOW_STEP_ORDERS[UnitResponsibleType.CONTRACT].length
  );
  await prisma.$transaction((tx) =>
    syncProjectPhases(
      tx,
      UnitResponsibleType.CONTRACT,
      ids.projects.contractReadyExport
    )
  );
  await createSubmission({
    projectId: ids.projects.contractReadyExport,
    workflowType: UnitResponsibleType.CONTRACT,
    stepOrder: 4,
    status: SubmissionStatus.COMPLETED,
    submittedBy: null,
    completedBy: ids.users.contractStaff,
    submissionType: SubmissionType.VENDOR,
    poNo: `${fy}-PO-UT-90007`,
    fieldKey: 'vendor_invoice',
    fileName: 'vendor_invoice_90007.pdf',
  });

  await createProject({
    id: ids.projects.closed,
    receiveSuffix: 90008,
    title: 'User Testing - Completed tablet procurement',
    description: 'CLOSED project for request-edit and history testing.',
    budget: 285000,
    status: ProjectStatus.CLOSED,
    procurementType: ProcurementType.LT500K,
    workflowType: UnitResponsibleType.CONTRACT,
    requestingDeptId: 'DEPT-STUAFF',
    requestingUnitId: 'UNIT-EDU',
    createdBy: ids.users.libraryStaff,
    procurementStatus: ProjectPhaseStatus.COMPLETED,
    contractStatus: ProjectPhaseStatus.COMPLETED,
    prNo: `${fy}-PR-UT-90008`,
    poNo: `${fy}-PO-UT-90008`,
    contractNo: `${fy}-CON-UT-90008`,
    migoNo: `${fy}-MIGO-UT-90008`,
    vendorName: 'Tablet Supply User Testing Co.',
    vendorEmail: 'vendor.tablet@example.test',
    procurementAssigneeIds: [ids.users.procurementLt],
    contractAssigneeIds: [ids.users.contractStaff],
  });

  await createProject({
    id: ids.projects.waitingCancel,
    receiveSuffix: 90009,
    title: 'User Testing - Air purifier order',
    description: 'WAITING_CANCEL project with an active cancellation request.',
    budget: 98000,
    status: ProjectStatus.WAITING_CANCEL,
    procurementType: ProcurementType.LT100K,
    requestingDeptId: 'DEPT-LOC',
    requestingUnitId: 'UNIT-BUILD',
    createdBy: ids.users.facilitiesRep,
    urgent: UrgentType.VERY_URGENT,
    procurementStatus: ProjectPhaseStatus.IN_PROGRESS,
    procurementStep: 1,
    procurementAssigneeIds: [ids.users.procurementLt],
  });

  await createProject({
    id: ids.projects.cancelled,
    receiveSuffix: 90010,
    title: 'User Testing - Cancelled printer repair',
    description: 'CANCELLED project for archive/list filtering tests.',
    budget: 43000,
    status: ProjectStatus.CANCELLED,
    procurementType: ProcurementType.LT100K,
    requestingDeptId: 'DEPT-LOC',
    requestingUnitId: 'UNIT-MAINT',
    createdBy: ids.users.maintenanceRep,
    procurementAssigneeIds: [ids.users.procurementLt],
  });

  await createProject({
    id: ids.projects.requestEdit,
    receiveSuffix: 90011,
    title: 'User Testing - Edited projector purchase',
    description: 'REQUEST_EDIT project with a requester-provided reason.',
    budget: 155000,
    status: ProjectStatus.REQUEST_EDIT,
    procurementType: ProcurementType.LT500K,
    workflowType: UnitResponsibleType.CONTRACT,
    requestingDeptId: 'DEPT-STUAFF',
    requestingUnitId: 'UNIT-NET',
    createdBy: ids.users.libraryStaff,
    procurementStatus: ProjectPhaseStatus.COMPLETED,
    contractStatus: ProjectPhaseStatus.COMPLETED,
    requestEditReason: 'Requester needs to update warranty details.',
    prNo: `${fy}-PR-UT-90011`,
    poNo: `${fy}-PO-UT-90011`,
    procurementAssigneeIds: [ids.users.procurementLt],
    contractAssigneeIds: [ids.users.contractStaff],
  });

  await createProject({
    id: ids.projects.internal,
    receiveSuffix: 90012,
    title: 'User Testing - Internal spare parts transfer',
    description: 'INTERNAL procurement workflow coverage.',
    budget: 510000,
    status: ProjectStatus.IN_PROGRESS,
    procurementType: ProcurementType.INTERNAL,
    requestingDeptId: 'DEPT-FIN',
    requestingUnitId: 'UNIT-FIN',
    createdBy: ids.users.financeStaff,
    procurementStatus: ProjectPhaseStatus.IN_PROGRESS,
    procurementStep: 2,
    procurementAssigneeIds: [ids.users.procurementHigh],
  });
  await seedCompletedSteps(
    ids.projects.internal,
    UnitResponsibleType.INTERNAL,
    ids.users.procurementHigh,
    ids.users.procurementHigh,
    1
  );
};

const seedCancellationsAndHistory = async () => {
  await prisma.projectCancellation.createMany({
    data: [
      {
        project_id: ids.projects.waitingCancel,
        reason: 'Requester found duplicated demand in another plan.',
        is_active: true,
        is_cancelled: false,
        requested_by: ids.users.facilitiesRep,
        requested_at: daysFromNow(-2),
      },
      {
        project_id: ids.projects.cancelled,
        reason: 'Repair was no longer needed after warranty replacement.',
        is_active: true,
        is_cancelled: true,
        requested_by: ids.users.maintenanceRep,
        requested_at: daysFromNow(-8),
        approved_by: ids.users.supplyHead,
        approved_at: daysFromNow(-7),
        cancelled_at: daysFromNow(-7),
      },
    ],
  });

  await prisma.projectHistory.createMany({
    data: [
      {
        project_id: ids.projects.waitingAccept,
        action: LogActionType.ASSIGNEE_UPDATE,
        old_value: { status: ProjectStatus.UNASSIGNED, assignees: [] },
        new_value: {
          status: ProjectStatus.WAITING_ACCEPT,
          assignees: [ids.users.procurementLt],
        },
        changed_by: ids.users.procHeadLt,
        changed_at: daysFromNow(-3),
      },
      {
        project_id: ids.projects.waitingApproval,
        action: LogActionType.STEP_UPDATE,
        old_value: { procurement_step: 1 },
        new_value: { procurement_step: 2 },
        changed_by: ids.users.procurementLt,
        changed_at: daysFromNow(-2),
      },
      {
        project_id: ids.projects.waitingCancel,
        action: LogActionType.STATUS_UPDATE,
        old_value: { status: ProjectStatus.IN_PROGRESS },
        new_value: { status: ProjectStatus.WAITING_CANCEL },
        changed_by: ids.users.facilitiesRep,
        changed_at: daysFromNow(-2),
      },
      {
        project_id: ids.projects.cancelled,
        action: LogActionType.STATUS_UPDATE,
        old_value: { status: ProjectStatus.WAITING_CANCEL },
        new_value: { status: ProjectStatus.CANCELLED },
        changed_by: ids.users.supplyHead,
        changed_at: daysFromNow(-7),
      },
      {
        project_id: ids.projects.requestEdit,
        action: LogActionType.STATUS_UPDATE,
        old_value: { status: ProjectStatus.CLOSED },
        new_value: {
          status: ProjectStatus.REQUEST_EDIT,
          request_edit_reason: 'Requester needs to update warranty details.',
        },
        changed_by: ids.users.libraryStaff,
        changed_at: daysFromNow(-4),
      },
    ],
  });
};

const seedBudgetPlans = async () => {
  await prisma.budgetPlan.createMany({
    data: [
      {
        budget_year: fiscalYear(),
        unit_id: 'UNIT-EDU',
        activity_type: 101,
        activity_type_name: 'Student service improvement',
        description: 'Furniture and device purchases for student services.',
        budget_name: 'Student affairs user-testing budget',
        budget_amount: 650000,
        project_id: ids.projects.unassigned,
        created_by: ids.users.libraryStaff,
      },
      {
        budget_year: fiscalYear(),
        unit_id: 'UNIT-SUP',
        activity_type: 202,
        activity_type_name: 'Supply operation reserve',
        description: 'Shared procurement user-testing budget.',
        budget_name: 'Supply user-testing budget',
        budget_amount: 2500000,
        project_id: ids.projects.procurementComplete,
        created_by: ids.users.itRep,
      },
      {
        budget_year: fiscalYear(),
        unit_id: 'UNIT-BUILD',
        activity_type: 303,
        activity_type_name: 'Facility operations',
        description: 'Building operation and outsourced services.',
        budget_name: 'Facility user-testing budget',
        budget_amount: 3200000,
        project_id: ids.projects.contractActive,
        created_by: ids.users.facilitiesRep,
      },
      {
        budget_year: fiscalYear(),
        unit_id: 'UNIT-FIN',
        activity_type: 404,
        activity_type_name: 'Finance internal operations',
        description: 'Internal transfer and finance unit operating plan.',
        budget_name: 'Finance user-testing budget',
        budget_amount: 900000,
        project_id: ids.projects.internal,
        created_by: ids.users.financeStaff,
      },
    ],
  });
};

async function main() {
  console.log('--- Start User Testing Seed ---');
  await cleanup();
  console.log('--- Database cleaned ---');

  await seedOrganization();
  await seedUsers();
  await seedProjects();
  await seedCancellationsAndHistory();
  await seedBudgetPlans();

  console.log('--- User Testing Seed Completed ---');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
