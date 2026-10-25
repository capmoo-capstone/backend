import {
  NotificationChannel,
  NotificationDeliveryStatus,
} from '@prisma/client';
import { prisma } from '../../config/prisma';
import { EmailKind } from '../../types/email-delivery.type';
import { activeUserWhere } from '../../utils/active-state';
import { OPS_DEPT_ID } from '../../utils/constant';
import { formatBangkokDate } from '../../utils/date';
import { ForbiddenError, NotFoundError } from '../../utils/errors';
import { projectReadWhere } from '../../utils/project-scope';
import {
  buildDailySummaryAudienceText,
  buildDailySummaryEmailContent,
  getDailySummaryCountsForRole,
  resolveDailySummaryRole,
} from './daily-summary-email.service';
import { AuthPayload, AuthRoleDetail } from '../../types/auth.type';
import {
  BusinessEmailContent,
  escapeHtml,
  withBusinessEmailClosing,
} from './business-email-content';
import {
  renderVendorPoEmailContent,
  renderVendorPoEmailPreview,
  VendorPoEmailData,
  VendorPoEmailPreview,
} from './templates/vendor-po-email.template';
import {
  renderVendorRequestEditEmailContent,
  renderVendorRequestEditEmailPreview,
  VendorRequestEditEmailPreview,
} from './templates/vendor-request-edit-email.template';
import {
  EmailDeliverySendError,
  sendTrackedEmail,
} from '../email-delivery.service';

type EmailRecipient = {
  email: string;
  fullName: string;
};

const isAllowedEmail = (email: string, allowedEmails?: ReadonlySet<string>) =>
  !allowedEmails || allowedEmails.has(email.trim().toLowerCase());

type DailySummaryRecipient = EmailRecipient & {
  id: string;
  role: ReturnType<typeof resolveDailySummaryRole>;
  audienceText: string;
  auth: AuthPayload;
};

export interface ContractCommitteeReminderEmailInput {
  recipientEmail: string;
  recipientName?: string | null;
  projectTitle: string;
  inspectionDate: Date;
  remainingDays: number;
}

export interface EmailDeliveryDraft {
  userId: string;
  notificationId?: string;
  channel: NotificationChannel;
  subject: string;
  body: string;
  htmlBody?: string;
  dedupeKey?: string | null;
  recipientEmail?: string | null;
  submissionId?: string | null;
  notificationDeliveryId?: string | null;
  emailKind?: EmailKind;
}

export interface EmailDeliveryResult {
  status: NotificationDeliveryStatus;
  errorMessage?: string | null;
  sentAt?: Date | null;
  providerMessageId?: string | null;
  notificationDeliveryId?: string | null;
}

export interface NotificationEmailTransport {
  queue(draft: EmailDeliveryDraft): Promise<EmailDeliveryResult>;
}

const getEmailAppConfig = () => ({
  appPublicUrl: process.env.APP_PUBLIC_URL?.trim() || '',
});

const normalizeUrl = (value: string) => value.replace(/\/+$/, '');

const getAppPublicUrl = () => {
  const { appPublicUrl } = getEmailAppConfig();

  if (!appPublicUrl) {
    throw new Error('APP_PUBLIC_URL is not configured');
  }

  return normalizeUrl(appPublicUrl);
};

const buildLoginUrl = () => `${getAppPublicUrl()}/login`;

export interface BusinessEmailOptions {
  userId?: string | null;
  kind: EmailKind;
  dedupeKey?: string | null;
  notificationId?: string | null;
  submissionId?: string | null;
}

const sendBusinessEmail = async (
  recipientEmail: string,
  content: { subject: string; text: string; html?: string },
  options?: BusinessEmailOptions
): Promise<{
  providerMessageId: string | null;
  notificationDeliveryId: string | null;
}> => {
  const recipient = recipientEmail?.trim() || '';
  const userId = options?.userId ?? null;

  if (options?.dedupeKey) {
    const existing = await prisma.notificationDelivery.findFirst({
      where: {
        ...(userId ? { user_id: userId } : {}),
        recipient_email: recipient,
        channel: NotificationChannel.EMAIL_IMMEDIATE,
        dedupe_key: options.dedupeKey,
      },
      select: { id: true, provider_message_id: true },
    });

    if (existing) {
      return {
        providerMessageId: existing.provider_message_id,
        notificationDeliveryId: existing.id,
      };
    }
  }

  const result = await sendTrackedEmail({
    kind: options?.kind ?? EmailKind.NOTIFICATION,
    recipient,
    subject: content.subject,
    text: content.text,
    html: content.html,
    submissionId: options?.submissionId,
    notificationId: options?.notificationId,
    userId,
    dedupeKey: options?.dedupeKey,
  });

  return {
    providerMessageId: result.resendEmailId,
    notificationDeliveryId: result.notificationDeliveryId,
  };
};

const formatPersonGreeting = (fullName: string) => `สวัสดีคุณ ${fullName},`;

const buildRegistrationPendingEmailContent = (
  recipient: EmailRecipient
): BusinessEmailContent =>
  withBusinessEmailClosing({
    subject: 'แจ้งสถานะการลงทะเบียน - อยู่ระหว่างรอการอนุมัติ',
    text: [
      formatPersonGreeting(recipient.fullName),
      '',
      'ขอบคุณสำหรับการลงทะเบียน ระบบได้รับข้อมูลของคุณเรียบร้อยแล้ว',
      '',
      'ขณะนี้อยู่ระหว่างการตรวจสอบโดยผู้ดูแลระบบ (Admin) เมื่อบัญชีของคุณได้รับการอนุมัติเรียบร้อยแล้ว ระบบจะส่งอีเมลแจ้งให้ทราบอีกครั้ง',
    ].join('\n'),
    html: [
      `<p>สวัสดีคุณ ${escapeHtml(recipient.fullName)},</p>`,
      '<p>ขอบคุณสำหรับการลงทะเบียน ระบบได้รับข้อมูลของคุณเรียบร้อยแล้ว</p>',
      '<p>ขณะนี้อยู่ระหว่างการตรวจสอบโดยผู้ดูแลระบบ (Admin) เมื่อบัญชีของคุณได้รับการอนุมัติเรียบร้อยแล้ว ระบบจะส่งอีเมลแจ้งให้ทราบอีกครั้ง</p>',
    ].join('\n'),
  });

const buildRegistrationApprovedEmailContent = (
  recipient: EmailRecipient
): BusinessEmailContent => {
  const loginUrl = buildLoginUrl();

  return withBusinessEmailClosing({
    subject: 'บัญชีของคุณได้รับการอนุมัติแล้ว - เข้าสู่ระบบได้ทันที',
    text: [
      formatPersonGreeting(recipient.fullName),
      '',
      'ยินดีด้วย! บัญชีของคุณได้รับการอนุมัติจากผู้ดูแลระบบเรียบร้อยแล้ว',
      '',
      'คุณสามารถเข้าสู่ระบบเพื่อเริ่มใช้งานได้ผ่านลิงก์ด้านล่างนี้:',
      loginUrl,
    ].join('\n'),
    html: [
      `<p>สวัสดีคุณ ${escapeHtml(recipient.fullName)},</p>`,
      '<p>ยินดีด้วย! บัญชีของคุณได้รับการอนุมัติจากผู้ดูแลระบบเรียบร้อยแล้ว</p>',
      `<p>คุณสามารถเข้าสู่ระบบเพื่อเริ่มใช้งานได้ผ่านลิงก์ด้านล่างนี้:<br /><a href="${escapeHtml(loginUrl)}">${escapeHtml(loginUrl)}</a></p>`,
    ].join('\n'),
  });
};

const dedupeRecipientsByEmail = <T extends { email: string }>(
  recipients: T[]
) => {
  const seen = new Set<string>();
  return recipients.filter((recipient) => {
    const key = recipient.email.trim().toLowerCase();
    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const mapAuthRoles = (
  roles: Array<{
    role: AuthRoleDetail['role'];
    department: { id: string; name: string };
    unit: { id: string; name: string } | null;
  }>
): AuthRoleDetail[] =>
  roles.map((role) => ({
    role: role.role,
    dept_id: role.department.id,
    dept_name: role.department.name,
    unit_id: role.unit?.id || null,
    unit_name: role.unit?.name || null,
  }));

const buildDailySummaryAuthPayload = (user: {
  id: string;
  username: string;
  full_name: string;
  email: string | null;
  roles: Array<{
    role: AuthRoleDetail['role'];
    department: { id: string; name: string };
    unit: { id: string; name: string } | null;
  }>;
}): AuthPayload => ({
  token: '',
  id: user.id,
  username: user.username,
  full_name: user.full_name,
  email: user.email,
  roles: mapAuthRoles(user.roles),
  is_delegated: false,
  delegated_by: [],
});

const resolveDailySummaryRecipient = (user: {
  id: string;
  username: string;
  full_name: string;
  email: string | null;
  roles: Array<{
    role: AuthRoleDetail['role'];
    department: { id: string; name: string };
    unit: { id: string; name: string } | null;
  }>;
}): DailySummaryRecipient | null => {
  if (!user.email?.trim()) {
    return null;
  }

  const auth = buildDailySummaryAuthPayload(user);
  const role = resolveDailySummaryRole({
    roles: auth.roles.filter((entry) => entry.dept_id === OPS_DEPT_ID),
  });

  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    role,
    audienceText: role
      ? buildDailySummaryAudienceText({
          role,
          unitNames: auth.roles
            .filter(
              (entry) => entry.role === role && entry.dept_id === OPS_DEPT_ID
            )
            .map((entry) => entry.unit_name ?? '')
            .filter(Boolean),
        })
      : 'สถานะโครงการที่ท่านสามารถเข้าถึงได้',
    auth,
  };
};

export const buildContractCommitteeReminderEmail = (
  input: ContractCommitteeReminderEmailInput
): BusinessEmailContent => {
  const subject = `แจ้งเตือนกำหนดตรวจรับอีก ${input.remainingDays} วัน - ${input.projectTitle}`;
  const greeting = input.recipientName?.trim()
    ? `เรียน ${input.recipientName.trim()},`
    : 'เรียน กรรมการตรวจรับ';
  const inspectionDateLabel = formatBangkokDate(input.inspectionDate);

  return withBusinessEmailClosing({
    subject,
    text: [
      greeting,
      '',
      `ขอแจ้งเตือนกำหนดตรวจรับสำหรับโครงการ ${input.projectTitle}`,
      `วันที่ตรวจรับ: ${inspectionDateLabel}`,
      `เหลือเวลาอีก ${input.remainingDays} วัน`,
      '',
      'กรุณาเตรียมการตรวจรับและดำเนินการตามขั้นตอนที่เกี่ยวข้องให้เรียบร้อย',
    ].join('\n'),
    html: [
      `<p>${escapeHtml(greeting)}</p>`,
      `<p>ขอแจ้งเตือนกำหนดตรวจรับสำหรับโครงการ ${escapeHtml(input.projectTitle)}</p>`,
      `<p>วันที่ตรวจรับ: ${escapeHtml(inspectionDateLabel)}<br />เหลือเวลาอีก <strong>${input.remainingDays}</strong> วัน</p>`,
      '<p>กรุณาเตรียมการตรวจรับและดำเนินการตามขั้นตอนที่เกี่ยวข้องให้เรียบร้อย</p>',
    ].join('\n'),
  });
};

export const sendHelloTestEmail = async (to?: string | null) => {
  const recipient = to?.trim() || '';
  await sendBusinessEmail(
    recipient,
    {
      subject: 'NexusProcure test email',
      text: 'hello test email',
    },
    {
      kind: EmailKind.TEST,
    }
  );
};

export const sendRegistrationPendingEmail = async (
  recipient: EmailRecipient
) => {
  await sendBusinessEmail(
    recipient.email,
    buildRegistrationPendingEmailContent(recipient),
    {
      kind: EmailKind.REGISTRATION_PENDING,
    }
  );
};

export const sendRegistrationApprovedEmail = async (
  recipient: EmailRecipient
) => {
  await sendBusinessEmail(
    recipient.email,
    buildRegistrationApprovedEmailContent(recipient),
    {
      kind: EmailKind.REGISTRATION_APPROVED,
    }
  );
};

export const getVendorEmailPreviewForProject = async (
  projectId: string,
  user?: AuthPayload,
  query?: {
    poNumber?: string;
    vendorName?: string;
    templateId?: 'VENDOR_PO_REQUEST' | 'VENDOR_REQUEST_EDIT';
    installmentNo?: number;
    reason?: string;
  }
): Promise<
  (VendorPoEmailPreview | VendorRequestEditEmailPreview) & {
    recipientEmail: string;
  }
> => {
  if (user) {
    const projectScope = projectReadWhere(user);
    const hasAccess =
      Object.keys(projectScope).length === 0 ||
      (await prisma.project.count({
        where: { AND: [{ id: projectId }, projectScope] },
      })) > 0;

    if (!hasAccess) {
      throw new ForbiddenError('You do not have access to this project');
    }
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      po_no: true,
      vendor_email: true,
      vendor_name: true,
    },
  });

  if (!project) {
    throw new NotFoundError('Project not found');
  }

  const resolvedPo = query?.poNumber?.trim() || project.po_no?.trim() || '';
  const resolvedName =
    query?.vendorName?.trim() || project.vendor_name?.trim() || '';
  const recipientEmail = project.vendor_email?.trim() || '';

  const preview =
    query?.templateId === 'VENDOR_REQUEST_EDIT'
      ? renderVendorRequestEditEmailPreview({
          poNumber: resolvedPo,
          vendorName: resolvedName,
          installmentNo: query.installmentNo,
          reason: query.reason,
        })
      : renderVendorPoEmailPreview({
          poNumber: resolvedPo,
          vendorName: resolvedName,
        });

  return {
    ...preview,
    recipientEmail,
  };
};

export const sendVendorEmailForProject = async (
  projectId: string,
  input: {
    recipient: string;
    templateId: 'VENDOR_PO_REQUEST' | 'VENDOR_REQUEST_EDIT';
    data: VendorPoEmailData & {
      installmentNo?: number | null;
      reason?: string | null;
    };
  },
  user?: AuthPayload,
  options?: { submissionId?: string | null }
) => {
  if (user) {
    const projectScope = projectReadWhere(user);
    const hasAccess =
      Object.keys(projectScope).length === 0 ||
      (await prisma.project.count({
        where: { AND: [{ id: projectId }, projectScope] },
      })) > 0;

    if (!hasAccess) {
      throw new ForbiddenError('You do not have access to this project');
    }
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });

  if (!project) {
    throw new NotFoundError('Project not found');
  }

  const content =
    input.templateId === 'VENDOR_REQUEST_EDIT'
      ? renderVendorRequestEditEmailContent(input.data)
      : renderVendorPoEmailContent(input.data);

  await sendBusinessEmail(input.recipient, content, {
    kind:
      input.templateId === 'VENDOR_REQUEST_EDIT'
        ? EmailKind.VENDOR_REQUEST_EDIT
        : EmailKind.VENDOR_PO,
    dedupeKey: options?.submissionId
      ? `vendor-submission:${options.submissionId}`
      : `vendor-${project.id}-${input.templateId}-${Date.now()}`,
    submissionId: options?.submissionId,
  });

  return {
    projectId: project.id,
    recipientEmail: input.recipient,
    subject: content.subject,
  };
};

export const sendContractCommitteeReminderEmail = async (
  input: ContractCommitteeReminderEmailInput
) => {
  const content = buildContractCommitteeReminderEmail(input);
  await sendBusinessEmail(input.recipientEmail, content, {
    kind: EmailKind.COMMITTEE_REMINDER,
    dedupeKey: `contract-committee-${input.projectTitle}-${input.recipientEmail}-${input.remainingDays}`,
  });
};

export const sendDailySummaryEmail = async (
  recipient: DailySummaryRecipient,
  reportDate: Date = new Date()
) => {
  const counts = await getDailySummaryCountsForRole(
    recipient.auth,
    recipient.role,
    reportDate
  );
  const content = buildDailySummaryEmailContent({
    fullName: recipient.fullName,
    audienceText: recipient.audienceText,
    counts,
    reportDate,
    appPublicUrl: getAppPublicUrl(),
  });

  const dateKey = reportDate.toISOString().slice(0, 10);
  await sendBusinessEmail(recipient.email, content, {
    userId: recipient.id,
    kind: EmailKind.DAILY_SUMMARY,
    dedupeKey: `daily-summary-${recipient.id}-${dateKey}`,
  });
};

export const sendDailySummaryEmailsToOptedInUsers = async (
  reportDate: Date = new Date(),
  allowedEmails?: ReadonlySet<string>
) => {
  const users = await prisma.user.findMany({
    where: {
      ...activeUserWhere(),
      daily_email: true,
      email: { not: null },
    },
    select: {
      id: true,
      username: true,
      email: true,
      full_name: true,
      roles: {
        select: {
          role: true,
          department: {
            select: {
              id: true,
              name: true,
            },
          },
          unit: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  const recipients = dedupeRecipientsByEmail(
    users.flatMap((user) => {
      const recipient = resolveDailySummaryRecipient(user);
      return recipient && isAllowedEmail(recipient.email, allowedEmails)
        ? [recipient]
        : [];
    })
  );

  for (const recipient of recipients) {
    await sendDailySummaryEmail(recipient, reportDate);
  }

  return {
    recipientCount: recipients.length,
  };
};

class ResendNotificationEmailTransport implements NotificationEmailTransport {
  async queue(draft: EmailDeliveryDraft): Promise<EmailDeliveryResult> {
    const recipient = draft.recipientEmail?.trim() || '';

    try {
      const result = await sendTrackedEmail({
        kind: draft.emailKind ?? EmailKind.NOTIFICATION,
        recipient,
        subject: draft.subject,
        text: draft.body,
        html: draft.htmlBody,
        submissionId: draft.submissionId,
        notificationDeliveryId: draft.notificationDeliveryId,
        userId: draft.userId,
        dedupeKey: draft.dedupeKey,
        channel: draft.channel,
      });

      return {
        status: result.status,
        sentAt: result.sentAt,
        errorMessage: null,
        providerMessageId: result.resendEmailId,
        notificationDeliveryId: result.notificationDeliveryId,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown email failure';
      const skipped =
        error instanceof EmailDeliverySendError &&
        error.status === NotificationDeliveryStatus.SKIPPED;

      return {
        status: skipped
          ? NotificationDeliveryStatus.SKIPPED
          : NotificationDeliveryStatus.FAILED,
        errorMessage: message,
        notificationDeliveryId:
          error instanceof EmailDeliverySendError
            ? error.notificationDeliveryId
            : null,
      };
    }
  }
}

export const notificationEmailTransport: NotificationEmailTransport =
  new ResendNotificationEmailTransport();
