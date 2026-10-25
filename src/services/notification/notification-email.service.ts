import {
  NotificationChannel,
  NotificationDeliveryStatus,
} from '@prisma/client';
import { prisma } from '../../config/prisma';
import { activeUserWhere } from '../../utils/active-state';
import { OPS_DEPT_ID } from '../../utils/constant';
import { formatBangkokDate } from '../../utils/date';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '../../utils/errors';
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
  VendorRequestEditEmailData,
  VendorRequestEditEmailPreview,
} from './templates/vendor-request-edit-email.template';

const RESEND_API_URL = 'https://api.resend.com/emails';

type ResendEmailPayload = {
  from: string;
  to: string[];
  subject: string;
  text: string;
  html?: string;
};

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
}

export interface EmailDeliveryResult {
  status: NotificationDeliveryStatus;
  errorMessage?: string | null;
  sentAt?: Date | null;
  providerMessageId?: string | null;
}

export interface NotificationEmailTransport {
  queue(draft: EmailDeliveryDraft): Promise<EmailDeliveryResult>;
}

const getResendConfig = () => ({
  apiKey: process.env.RESEND_API_KEY?.trim() || '',
  from: process.env.RESEND_FROM?.trim() || '',
  appPublicUrl: process.env.APP_PUBLIC_URL?.trim() || '',
});

const normalizeUrl = (value: string) => value.replace(/\/+$/, '');

const getAppPublicUrl = () => {
  const { appPublicUrl } = getResendConfig();

  if (!appPublicUrl) {
    throw new Error('APP_PUBLIC_URL is not configured');
  }

  return normalizeUrl(appPublicUrl);
};

const buildLoginUrl = () => `${getAppPublicUrl()}/login`;

const sendResendEmail = async (
  payload: ResendEmailPayload
): Promise<{ id: string | null }> => {
  const { apiKey } = getResendConfig();
  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (response.ok) {
    try {
      const data = (await response.json()) as { id?: string };
      return { id: data?.id ?? null };
    } catch {
      return { id: null };
    }
  }

  let message = `Resend request failed with status ${response.status}`;

  try {
    const data = (await response.json()) as {
      message?: string;
      error?: { message?: string };
    };
    message = data.error?.message || data.message || message;
  } catch {
    // Keep the default message when the provider body is unavailable.
  }

  throw new Error(message);
};

const sendEmail = async (payload: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<{ providerMessageId: string | null }> => {
  const { apiKey, from } = getResendConfig();
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured');
  }

  if (!from) {
    throw new Error('RESEND_FROM is not configured');
  }

  const recipient = payload.to.trim();
  if (!recipient) {
    throw new Error('A recipient email is required');
  }

  const resendResult = await sendResendEmail({
    from,
    to: [recipient],
    subject: payload.subject,
    text: payload.text,
    ...(payload.html ? { html: payload.html } : {}),
  });

  return { providerMessageId: resendResult.id };
};

export interface BusinessEmailOptions {
  userId?: string | null;
  emailType?: string;
  metadata?: Record<string, unknown> | null;
  dedupeKey?: string | null;
  notificationId?: string | null;
}

const sendBusinessEmail = async (
  recipientEmail: string,
  content: { subject: string; text: string; html?: string },
  options?: BusinessEmailOptions
): Promise<{ providerMessageId: string | null }> => {
  const recipient = recipientEmail?.trim() || '';
  const emailType = options?.emailType ?? 'BUSINESS_EMAIL';
  const userId = options?.userId ?? null;

  if (options?.dedupeKey) {
    const existing = await prisma.notificationDelivery.findFirst({
      where: {
        ...(userId ? { user_id: userId } : {}),
        channel: NotificationChannel.EMAIL_IMMEDIATE,
        dedupe_key: options.dedupeKey,
        status: {
          in: [
            NotificationDeliveryStatus.PENDING,
            NotificationDeliveryStatus.SENT,
            NotificationDeliveryStatus.SKIPPED,
          ],
        },
      },
      select: { id: true, provider_message_id: true },
    });

    if (existing) {
      return { providerMessageId: existing.provider_message_id };
    }
  }

  let deliveryRecord: { id: string } | null = null;
  try {
    deliveryRecord = await prisma.notificationDelivery.create({
      data: {
        user_id: userId,
        recipient_email: recipient,
        channel: NotificationChannel.EMAIL_IMMEDIATE,
        email_type: emailType,
        status: NotificationDeliveryStatus.PENDING,
        subject: content.subject,
        body: content.text,
        dedupe_key: options?.dedupeKey ?? null,
        notification_id: options?.notificationId ?? null,
        metadata: options?.metadata ? (options.metadata as any) : undefined,
      },
      select: { id: true },
    });
  } catch (err) {
    console.error('Failed to create pending notification delivery record', err);
  }

  try {
    const { providerMessageId } = await sendEmail({
      to: recipient,
      subject: content.subject,
      text: content.text,
      html: content.html,
    });

    if (deliveryRecord) {
      await prisma.notificationDelivery.update({
        where: { id: deliveryRecord.id },
        data: {
          status: NotificationDeliveryStatus.SENT,
          sent_at: new Date(),
          provider_message_id: providerMessageId,
        },
      });
    }

    return { providerMessageId };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown email failure';
    const isSkipped =
      errorMessage === 'RESEND_API_KEY is not configured' ||
      errorMessage === 'RESEND_FROM is not configured' ||
      errorMessage === 'A recipient email is required';

    if (deliveryRecord) {
      await prisma.notificationDelivery.update({
        where: { id: deliveryRecord.id },
        data: {
          status: isSkipped
            ? NotificationDeliveryStatus.SKIPPED
            : NotificationDeliveryStatus.FAILED,
          error_message: errorMessage,
        },
      });
    }

    throw error;
  }
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
      emailType: 'TEST',
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
      emailType: 'STAFF_REGISTRATION_PENDING',
      metadata: { fullName: recipient.fullName },
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
      emailType: 'STAFF_REGISTRATION_APPROVED',
      metadata: { fullName: recipient.fullName },
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
  user?: AuthPayload
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
    emailType: input.templateId,
    metadata: {
      projectId: project.id,
    },
    dedupeKey: `vendor-${project.id}-${input.templateId}-${Date.now()}`,
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
    emailType: 'COMMITTEE_REMINDER',
    metadata: {
      projectTitle: input.projectTitle,
      remainingDays: input.remainingDays,
    },
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
    emailType: 'DAILY_SUMMARY',
    metadata: {
      reportDate: dateKey,
      role: recipient.role,
    },
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

    if (!recipient) {
      return {
        status: NotificationDeliveryStatus.SKIPPED,
        errorMessage: 'Recipient email is missing',
      };
    }

    try {
      const { providerMessageId } = await sendEmail({
        to: recipient,
        subject: draft.subject,
        text: draft.body,
        html: draft.htmlBody,
      });

      return {
        status: NotificationDeliveryStatus.SENT,
        sentAt: new Date(),
        errorMessage: null,
        providerMessageId,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown email failure';
      const skippedErrors = new Set([
        'RESEND_API_KEY is not configured',
        'RESEND_FROM is not configured',
      ]);

      return {
        status: skippedErrors.has(message)
          ? NotificationDeliveryStatus.SKIPPED
          : NotificationDeliveryStatus.FAILED,
        errorMessage: message,
      };
    }
  }
}

export const notificationEmailTransport: NotificationEmailTransport =
  new ResendNotificationEmailTransport();
