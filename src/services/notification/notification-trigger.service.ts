import {
  NotificationCategory,
  NotificationPriority,
  UserRole,
} from '@prisma/client';
import {
  dispatchNotification,
  getProjectContext,
  getRoleRecipients,
  type PersistedNotificationResult,
  type TxClient,
} from './notification-core.service';
import { formatBangkokDate } from '../../lib/date';

const mergeNotifications = (
  ...batches: PersistedNotificationResult[][]
): PersistedNotificationResult[] => batches.flat();

export const notifyProjectAssigned = async (
  tx: TxClient,
  input: {
    project_id: string;
    assignee_ids: string[];
    actor_id: string;
  }
) => {
  const project = await getProjectContext(tx, input.project_id);
  return dispatchNotification(tx, {
    recipient_ids: input.assignee_ids.filter((id) => id !== input.actor_id),
    actor_id: input.actor_id,
    project_id: input.project_id,
    kind: 'ASSIGNED_PROJECTS',
    category: NotificationCategory.ASSIGNMENTS,
    priority: NotificationPriority.HIGH,
    title: 'ได้รับมอบหมายงานใหม่',
    body: `คุณได้รับมอบหมายให้ดูแลโครงการ "${project.title}"`,
    target_path: `/app/projects/${project.id}`,
    action_label: 'เปิดโครงการ',
    requires_action: true,
    dedupe_key: `assignment:${project.id}:${[...input.assignee_ids].sort().join(',')}`,
  });
};

export const notifyResponsibleAdded = async (
  tx: TxClient,
  input: {
    project_id: string;
    added_user_id: string;
    actor_id: string;
  }
) => {
  const project = await getProjectContext(tx, input.project_id);
  return dispatchNotification(tx, {
    recipient_ids: [input.added_user_id].filter((id) => id !== input.actor_id),
    actor_id: input.actor_id,
    project_id: input.project_id,
    kind: 'RESPONSIBLE_ADDED',
    category: NotificationCategory.WORKFLOW_UPDATES,
    priority: NotificationPriority.MEDIUM,
    title: 'ถูกเพิ่มเป็นผู้รับผิดชอบ',
    body: `คุณถูกเพิ่มเป็นผู้รับผิดชอบในโครงการ "${project.title}"`,
    target_path: `/app/projects/${project.id}`,
    action_label: 'เปิดโครงการ',
    requires_action: false,
    dedupe_key: `responsible-added:${project.id}:${input.added_user_id}`,
  });
};

export const notifyResponsibleRemoved = async (
  tx: TxClient,
  input: {
    project_id: string;
    removed_user_id: string;
    actor_id: string;
  }
) => {
  const project = await getProjectContext(tx, input.project_id);
  return dispatchNotification(tx, {
    recipient_ids: [input.removed_user_id].filter(
      (id) => id !== input.actor_id
    ),
    actor_id: input.actor_id,
    project_id: input.project_id,
    kind: 'RESPONSIBLE_REMOVED',
    category: NotificationCategory.WORKFLOW_UPDATES,
    priority: NotificationPriority.MEDIUM,
    title: 'ถูกนำออกจากผู้รับผิดชอบ',
    body: `คุณถูกนำออกจากโครงการ "${project.title}"`,
    target_path: `/app/projects/${project.id}`,
    action_label: 'เปิดโครงการ',
    requires_action: false,
    dedupe_key: `responsible-removed:${project.id}:${input.removed_user_id}`,
  });
};

export const notifyCancellationRequested = async (
  tx: TxClient,
  input: {
    project_id: string;
    actor_id: string;
  }
) => {
  const project = await getProjectContext(tx, input.project_id);
  const unitHeads = await getRoleRecipients(tx, {
    role: UserRole.HEAD_OF_UNIT,
    unit_id: project.responsible_unit_id,
  });

  return dispatchNotification(tx, {
    recipient_ids: Array.from(new Set(unitHeads.map((user) => user.id))).filter(
      (id) => id !== input.actor_id
    ),
    actor_id: input.actor_id,
    project_id: input.project_id,
    kind: 'CANCEL_REQUESTED',
    category: NotificationCategory.CANCELLATIONS,
    priority: NotificationPriority.HIGH,
    title: 'มีคำขอยกเลิกโครงการ',
    body: `โครงการ "${project.title}" กำลังรอการพิจารณายกเลิก`,
    target_path: `/app/projects/${project.id}`,
    action_label: 'ตรวจสอบ',
    requires_action: true,
    dedupe_key: `cancel-request:${project.id}`,
  });
};

export const notifyCancellationApproved = async (
  tx: TxClient,
  input: {
    project_id: string;
    actor_id: string;
  }
) => {
  const project = await getProjectContext(tx, input.project_id);
  const recipients = [
    project.creator.id,
    ...project.assignee_procurement.map((item) => item.id),
    ...project.assignee_contract.map((item) => item.id),
  ].filter((id) => id !== input.actor_id);

  return dispatchNotification(tx, {
    recipient_ids: recipients,
    actor_id: input.actor_id,
    project_id: input.project_id,
    kind: 'CANCEL_APPROVED',
    category: NotificationCategory.CANCELLATIONS,
    priority: NotificationPriority.MEDIUM,
    title: 'อนุมัติการยกเลิกโครงการ',
    body: `โครงการ "${project.title}" ถูกอนุมัติให้ยกเลิกแล้ว`,
    target_path: `/app/projects/${project.id}`,
    action_label: 'เปิดโครงการ',
    dedupe_key: `cancel-approved:${project.id}`,
  });
};

export const notifyCancellationRejected = async (
  tx: TxClient,
  input: {
    project_id: string;
    actor_id: string;
  }
) => {
  const project = await getProjectContext(tx, input.project_id);
  const recipients = [
    project.creator.id,
    ...project.assignee_procurement.map((item) => item.id),
    ...project.assignee_contract.map((item) => item.id),
  ].filter((id) => id !== input.actor_id);

  return dispatchNotification(tx, {
    recipient_ids: recipients,
    actor_id: input.actor_id,
    project_id: input.project_id,
    kind: 'CANCEL_REJECTED',
    category: NotificationCategory.CANCELLATIONS,
    priority: NotificationPriority.MEDIUM,
    title: 'ปฏิเสธคำขอยกเลิกโครงการ',
    body: `คำขอยกเลิกของโครงการ "${project.title}" ถูกปฏิเสธ`,
    target_path: `/app/projects/${project.id}`,
    action_label: 'เปิดโครงการ',
    dedupe_key: `cancel-rejected:${project.id}`,
  });
};

export const notifyApprovalRequired = async (
  tx: TxClient,
  input: {
    project_id: string;
    actor_id: string;
    step_order: number;
  }
) => {
  const project = await getProjectContext(tx, input.project_id);
  const recipients = await getRoleRecipients(tx, {
    role: UserRole.HEAD_OF_UNIT,
    unit_id: project.responsible_unit_id,
  });

  return dispatchNotification(tx, {
    recipient_ids: recipients
      .map((user) => user.id)
      .filter((id) => id !== input.actor_id),
    actor_id: input.actor_id,
    project_id: input.project_id,
    kind: 'WAITING_APPROVE',
    category: NotificationCategory.APPROVALS,
    priority: NotificationPriority.HIGH,
    title: 'มีงานรออนุมัติ',
    body: `ขั้นตอนที่ ${input.step_order} ของโครงการ "${project.title}" กำลังรอการอนุมัติ`,
    target_path: `/app/projects/${project.id}`,
    action_label: 'ตรวจสอบ',
    requires_action: true,
    dedupe_key: `approval:${project.id}:${input.step_order}`,
  });
};

export const notifySignatureRequired = async (
  tx: TxClient,
  input: {
    project_id: string;
    actor_id: string;
    step_order: number;
  }
) => {
  const project = await getProjectContext(tx, input.project_id);
  const recipients = await getRoleRecipients(tx, {
    role: UserRole.DOCUMENT_STAFF,
  });

  return dispatchNotification(tx, {
    recipient_ids: recipients
      .map((user) => user.id)
      .filter((id) => id !== input.actor_id),
    actor_id: input.actor_id,
    project_id: input.project_id,
    kind: 'SIGN_REQUIRED',
    category: NotificationCategory.APPROVALS,
    priority: NotificationPriority.HIGH,
    title: 'มีเอกสารรอเสนอ/ลงนาม',
    body: `ขั้นตอนที่ ${input.step_order} ของโครงการ "${project.title}" ต้องดำเนินการต่อโดยเจ้าหน้าที่เอกสาร`,
    target_path: `/app/projects/${project.id}`,
    action_label: 'เปิดโครงการ',
    requires_action: true,
    dedupe_key: `signature:${project.id}:${input.step_order}`,
  });
};

export const notifyWorkflowStepApproved = async (
  tx: TxClient,
  input: {
    project_id: string;
    actor_id: string;
    submitter_id?: string | null;
    step_order: number;
  }
) => {
  if (!input.submitter_id || input.submitter_id === input.actor_id) {
    return [];
  }

  const project = await getProjectContext(tx, input.project_id);
  return dispatchNotification(tx, {
    recipient_ids: [input.submitter_id],
    actor_id: input.actor_id,
    project_id: input.project_id,
    kind: 'APPROVED_STEP',
    category: NotificationCategory.WORKFLOW_UPDATES,
    priority: NotificationPriority.MEDIUM,
    title: 'ขั้นตอนได้รับการอนุมัติ',
    body: `ขั้นตอนที่ ${input.step_order} ของโครงการ "${project.title}" ได้รับการอนุมัติแล้ว`,
    target_path: `/app/projects/${project.id}`,
    action_label: 'เปิดโครงการ',
    dedupe_key: `workflow-approved:${project.id}:${input.step_order}`,
  });
};

export const notifySubmissionRejected = async (
  tx: TxClient,
  input: {
    project_id: string;
    actor_id: string;
    submitter_id?: string | null;
    step_order: number;
    reason?: string | null;
  }
) => {
  if (!input.submitter_id || input.submitter_id === input.actor_id) {
    return [];
  }

  const project = await getProjectContext(tx, input.project_id);
  return dispatchNotification(tx, {
    recipient_ids: [input.submitter_id],
    actor_id: input.actor_id,
    project_id: input.project_id,
    kind: 'SUBMISSION_REJECTED',
    category: NotificationCategory.WORKFLOW_UPDATES,
    priority: NotificationPriority.HIGH,
    title: 'ขั้นตอนถูกตีกลับ',
    body: input.reason
      ? `ขั้นตอนที่ ${input.step_order} ของโครงการ "${project.title}" ถูกตีกลับ: ${input.reason}`
      : `ขั้นตอนที่ ${input.step_order} ของโครงการ "${project.title}" ถูกตีกลับ`,
    target_path: `/app/projects/${project.id}`,
    action_label: 'เปิดโครงการ',
    requires_action: true,
    dedupe_key: `submission-rejected:${project.id}:${input.step_order}`,
  });
};

export const notifyVendorSubmissionReceived = async (
  tx: TxClient,
  input: {
    project_id: string;
    submission_id: string;
  }
) => {
  const project = await getProjectContext(tx, input.project_id);
  const financeStaff = await getRoleRecipients(tx, {
    role: UserRole.FINANCE_STAFF,
  });

  const documentNotifications = await dispatchNotification(tx, {
    recipient_ids: project.assignee_contract.map((user) => user.id),
    project_id: input.project_id,
    kind: 'ASSIGNED_DOCUMENT',
    category: NotificationCategory.VENDOR_SUBMISSIONS,
    priority: NotificationPriority.HIGH,
    title: 'ผู้ค้าส่งเอกสารแล้ว',
    body: `ผู้ค้าได้ส่งเอกสารสำหรับโครงการ "${project.title}" แล้ว`,
    target_path: '/app/vendor-response',
    action_label: 'เปิดรายการ',
    requires_action: true,
    dedupe_key: `vendor-submission:${input.submission_id}`,
  });

  const financeNotifications = await dispatchNotification(tx, {
    recipient_ids: financeStaff.map((user) => user.id),
    project_id: input.project_id,
    kind: 'FINANCE_SUBMIT',
    category: NotificationCategory.FINANCE_HANDOFFS,
    priority: NotificationPriority.MEDIUM,
    title: 'มีงานพร้อมส่งต่อการเงิน',
    body: `โครงการ "${project.title}" มีเอกสารจากผู้ค้าพร้อมสำหรับขั้นตอนการเงิน`,
    target_path: `/app/projects/${project.id}`,
    action_label: 'เปิดโครงการ',
    requires_action: false,
    dedupe_key: `finance-handoff:${input.submission_id}`,
  });

  return mergeNotifications(documentNotifications, financeNotifications);
};

export const notifyFinanceExportReady = async (
  tx: TxClient,
  input: {
    project_id: string;
    actor_id: string;
    installment_no: number;
  }
) => {
  const project = await getProjectContext(tx, input.project_id);
  const financeStaff = await getRoleRecipients(tx, {
    role: UserRole.FINANCE_STAFF,
  });

  return dispatchNotification(tx, {
    recipient_ids: financeStaff.map((user) => user.id),
    actor_id: input.actor_id,
    project_id: input.project_id,
    kind: 'FINANCE_SUBMIT',
    category: NotificationCategory.FINANCE_HANDOFFS,
    priority: NotificationPriority.MEDIUM,
    title: 'มีงานพร้อมส่งออกการเงิน',
    body: `งวดที่ ${input.installment_no} ของโครงการ "${project.title}" พร้อมส่งออกการเงิน`,
    target_path: `/app/projects/${project.id}`,
    action_label: 'เปิดโครงการ',
    requires_action: false,
    dedupe_key: `finance-ready:${project.id}:${input.installment_no}`,
  });
};

export const notifyFinanceRequestEdit = async (
  tx: TxClient,
  input: {
    project_id: string;
    actor_id: string;
    installment_no: number;
    reason?: string | null;
  }
) => {
  const project = await getProjectContext(tx, input.project_id);
  const recipients = project.assignee_contract
    .map((item) => item.id)
    .filter((id) => id !== input.actor_id);

  return dispatchNotification(tx, {
    recipient_ids: recipients,
    actor_id: input.actor_id,
    project_id: input.project_id,
    kind: 'FINANCE_REQUEST_EDIT',
    category: NotificationCategory.FINANCE_HANDOFFS,
    priority: NotificationPriority.HIGH,
    title: 'การเงินส่งคืนให้แก้ไข',
    body: input.reason
      ? `งวดที่ ${input.installment_no} ของโครงการ "${project.title}" ถูกส่งคืนจากการเงินเพื่อแก้ไข: ${input.reason}`
      : `งวดที่ ${input.installment_no} ของโครงการ "${project.title}" ถูกส่งคืนจากการเงินเพื่อแก้ไข`,
    target_path: `/app/projects/${project.id}`,
    action_label: 'เปิดโครงการ',
    requires_action: true,
    dedupe_key: `finance-request-edit:${project.id}:${input.installment_no}`,
  });
};

export const notifyDelegationStarted = async (
  tx: TxClient,
  input: {
    delegator_id: string;
    delegatee_id: string;
    actor_id: string;
    role_label: string;
    start_date: Date;
    end_date: Date | null;
  }
) => {
  const startDateStr = input.start_date
    ? formatBangkokDate(input.start_date)
    : '';
  const endDateStr = input.end_date ? formatBangkokDate(input.end_date) : '';
  const dateLabel = endDateStr
    ? `ตั้งแต่ ${startDateStr} ถึง ${endDateStr}`
    : `เริ่ม ${startDateStr}`;

  return dispatchNotification(tx, {
    recipient_ids: [input.delegator_id, input.delegatee_id],
    actor_id: input.actor_id,
    kind: 'DELEGATION_STARTED',
    category: NotificationCategory.DELEGATION,
    priority: NotificationPriority.HIGH,
    title: 'เริ่มการมอบหมายสิทธิ์แทน',
    body: `มีการมอบหมายสิทธิ์ ${input.role_label} ${dateLabel}`,
    target_path: '/app/me/profile',
    action_label: 'ดูโปรไฟล์',
    dedupe_key: `delegation-start:${input.delegator_id}:${input.delegatee_id}:${input.role_label}:${startDateStr}`,
  });
};

export const notifyDelegationEnded = async (
  tx: TxClient,
  input: {
    delegator_id: string;
    delegatee_id: string;
    actor_id: string;
    role_label: string;
  }
) => {
  return dispatchNotification(tx, {
    recipient_ids: [input.delegator_id, input.delegatee_id],
    actor_id: input.actor_id,
    kind: 'DELEGATION_ENDED',
    category: NotificationCategory.DELEGATION,
    priority: NotificationPriority.MEDIUM,
    title: 'สิ้นสุดการมอบหมายสิทธิ์แทน',
    body: `สิทธิ์แทนสำหรับบทบาท ${input.role_label} ถูกยกเลิกแล้ว`,
    target_path: '/app/me/profile',
    action_label: 'ดูโปรไฟล์',
    dedupe_key: `delegation-end:${input.delegator_id}:${input.delegatee_id}:${input.role_label}`,
  });
};

export const notifyProjectReturnedForRevision = async (
  tx: TxClient,
  input: {
    project_id: string;
    actor_id: string;
    reason?: string | null;
  }
) => {
  const project = await getProjectContext(tx, input.project_id);
  const recipients = [
    project.creator.id,
    ...project.assignee_procurement.map((item) => item.id),
    ...project.assignee_contract.map((item) => item.id),
  ].filter((id) => id !== input.actor_id);

  return dispatchNotification(tx, {
    recipient_ids: recipients,
    actor_id: input.actor_id,
    project_id: input.project_id,
    kind: 'RETURNED_FOR_REVISION',
    category: NotificationCategory.ASSIGNMENTS,
    priority: NotificationPriority.HIGH,
    title: 'งานถูกตีกลับให้แก้ไข',
    body: input.reason
      ? `โครงการ "${project.title}" ถูกตีกลับเพื่อแก้ไข: ${input.reason}`
      : `โครงการ "${project.title}" ถูกตีกลับเพื่อแก้ไข`,
    target_path: `/app/projects/${project.id}`,
    action_label: 'แก้ไขโครงการ',
    requires_action: true,
    dedupe_key: `revision:${project.id}`,
  });
};
