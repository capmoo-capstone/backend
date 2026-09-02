import {
  NotificationChannel,
  NotificationDeliveryStatus,
} from '@prisma/client';
import { prisma } from '../../config/prisma';
import { activeUserWhere } from '../../utils/active-state';
import { formatBangkokDate } from '../../utils/date';
import { OPS_DEPT_ID } from '../../utils/constant';
import { BadRequestError, NotFoundError } from '../../utils/errors';
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

type DailySummaryRecipient = EmailRecipient & {
  id: string;
  role: NonNullable<ReturnType<typeof resolveDailySummaryRole>>;
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
}

export interface NotificationEmailTransport {
  queue(draft: EmailDeliveryDraft): Promise<EmailDeliveryResult>;
}

const getResendConfig = () => ({
  apiKey: process.env.RESEND_API_KEY?.trim() || '',
  from: process.env.RESEND_FROM?.trim() || '',
  appPublicUrl: process.env.APP_PUBLIC_URL?.trim() || '',
  vendorAppPublicUrl: process.env.VENDOR_APP_PUBLIC_URL?.trim() || '',
});

const normalizeUrl = (value: string) => value.replace(/\/+$/, '');

const getAppPublicUrl = () => {
  const { appPublicUrl } = getResendConfig();

  if (!appPublicUrl) {
    throw new Error('APP_PUBLIC_URL is not configured');
  }

  return normalizeUrl(appPublicUrl);
};

const getVendorAppPublicUrl = () => {
  const { vendorAppPublicUrl } = getResendConfig();
  if (!vendorAppPublicUrl) {
    throw new Error('VENDOR_APP_PUBLIC_URL is not configured');
  }

  return normalizeUrl(vendorAppPublicUrl);
};

const buildLoginUrl = () => `${getAppPublicUrl()}/login`;
const buildVendorFormUrl = () => `${getVendorAppPublicUrl()}/vendor-form`;

const sendResendEmail = async (payload: ResendEmailPayload) => {
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
    return;
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
}) => {
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

  await sendResendEmail({
    from,
    to: [recipient],
    subject: payload.subject,
    text: payload.text,
    ...(payload.html ? { html: payload.html } : {}),
  });
};

const sendBusinessEmail = async (
  recipientEmail: string,
  content: BusinessEmailContent
) => {
  await sendEmail({
    to: recipientEmail,
    subject: content.subject,
    text: content.text,
    html: content.html,
  });
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

const buildVendorPoRequestEmailContent = (input: {
  vendorName?: string | null;
  poNumber: string;
}): BusinessEmailContent => {
  const vendorLabel = input.vendorName?.trim() || 'บริษัทคู่ค้า';
  const vendorFormUrl = buildVendorFormUrl();

  return withBusinessEmailClosing({
    subject: `รบกวนส่งเอกสารแนบสำหรับใบสั่งซื้อ PO #${input.poNumber}`,
    text: [
      `เรียน ${vendorLabel}`,
      '',
      `ขอแจ้งรายละเอียดใบสั่งซื้อหมายเลข PO #${input.poNumber} ของท่าน`,
      '',
      'รบกวนทำการแนบไฟล์เอกสารที่เกี่ยวข้องผ่านแบบฟอร์มสำหรับ Vendor ได้ที่ลิงก์นี้:',
      vendorFormUrl,
      '',
      `หมายเหตุ: โปรดระบุหมายเลข PO #${input.poNumber} ทุกครั้งในการส่งเอกสาร`,
    ].join('\n'),
    html: [
      `<p>เรียน ${escapeHtml(vendorLabel)}</p>`,
      `<p>ขอแจ้งรายละเอียดใบสั่งซื้อหมายเลข PO #${escapeHtml(input.poNumber)} ของท่าน</p>`,
      `<p>รบกวนทำการแนบไฟล์เอกสารที่เกี่ยวข้องผ่านแบบฟอร์มสำหรับ Vendor ได้ที่ลิงก์นี้:<br /><a href="${escapeHtml(vendorFormUrl)}">${escapeHtml(vendorFormUrl)}</a></p>`,
      `<p>หมายเหตุ: โปรดระบุหมายเลข PO #${escapeHtml(input.poNumber)} ทุกครั้งในการส่งเอกสาร</p>`,
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
  if (!user.email) {
    return null;
  }

  const auth = buildDailySummaryAuthPayload(user);
  const role = resolveDailySummaryRole(auth);

  if (!role) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    fullName: user.full_name,
    role,
    audienceText: buildDailySummaryAudienceText({
      role,
      unitNames: auth.roles
        .filter((entry) => entry.role === role)
        .map((entry) => entry.unit_name ?? '')
        .filter(Boolean),
    }),
    auth,
  };
};

export const buildContractCommitteeReminderEmail = (
  input: ContractCommitteeReminderEmailInput
): BusinessEmailContent => {
  const subject = `แจ้งเตือนกำหนดตรวจรับอีก ${input.remainingDays} วัน - ${input.projectTitle}`;
  const greeting = input.recipientName?.trim()
    ? `เรียนคุณ ${input.recipientName.trim()},`
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
  await sendEmail({
    to: to?.trim() || '',
    subject: 'NexusProcure test email',
    text: 'hello test email',
  });
};

export const sendRegistrationPendingEmail = async (
  recipient: EmailRecipient
) => {
  await sendBusinessEmail(
    recipient.email,
    buildRegistrationPendingEmailContent(recipient)
  );
};

export const sendRegistrationApprovedEmail = async (
  recipient: EmailRecipient
) => {
  await sendBusinessEmail(
    recipient.email,
    buildRegistrationApprovedEmailContent(recipient)
  );
};

export const sendVendorPoRequestEmail = async (input: {
  vendorEmail: string;
  vendorName?: string | null;
  poNumber: string;
}) => {
  await sendBusinessEmail(
    input.vendorEmail,
    buildVendorPoRequestEmailContent({
      vendorName: input.vendorName,
      poNumber: input.poNumber,
    })
  );
};

export const sendVendorPoRequestEmailForProject = async (projectId: string) => {
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

  if (!project.po_no) {
    throw new BadRequestError('Project PO number is missing');
  }

  if (!project.vendor_email) {
    throw new BadRequestError('Project vendor email is missing');
  }

  await sendVendorPoRequestEmail({
    vendorEmail: project.vendor_email,
    vendorName: project.vendor_name,
    poNumber: project.po_no,
  });

  return {
    projectId: project.id,
    poNumber: project.po_no,
    recipientEmail: project.vendor_email,
  };
};

export const sendContractCommitteeReminderEmail = async (
  input: ContractCommitteeReminderEmailInput
) => {
  const content = buildContractCommitteeReminderEmail(input);
  await sendBusinessEmail(input.recipientEmail, content);
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

  await sendBusinessEmail(recipient.email, content);
};

export const sendDailySummaryEmailsToOpsUsers = async (
  reportDate: Date = new Date()
) => {
  const users = await prisma.user.findMany({
    where: {
      ...activeUserWhere(),
      email: { not: null },
      roles: {
        some: {
          dept_id: OPS_DEPT_ID,
        },
      },
    },
    select: {
      id: true,
      username: true,
      email: true,
      full_name: true,
      roles: {
        where: {
          dept_id: OPS_DEPT_ID,
        },
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
      return recipient ? [recipient] : [];
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
      await sendEmail({
        to: recipient,
        subject: draft.subject,
        text: draft.body,
        html: draft.htmlBody,
      });

      return {
        status: NotificationDeliveryStatus.SENT,
        sentAt: new Date(),
        errorMessage: null,
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
