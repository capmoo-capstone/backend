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

const RESEND_API_URL = 'https://api.resend.com/emails';
const COMPANY_NAME = 'NexusProcure';

type ResendEmailPayload = {
  from: string;
  to: string[];
  subject: string;
  text: string;
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

const sendPlainTextEmail = async (payload: {
  to: string;
  subject: string;
  text: string;
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
  });
};

const formatPersonGreeting = (fullName: string) => `สวัสดีคุณ ${fullName},`;

const formatCompanyClosing = () => `ขอแสดงความนับถือ\n\nทีมงาน ${COMPANY_NAME}`;

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
) => {
  const subject = `แจ้งเตือนกำหนดตรวจรับอีก ${input.remainingDays} วัน - ${input.projectTitle}`;
  const greeting = input.recipientName?.trim()
    ? `เรียนคุณ ${input.recipientName.trim()},`
    : 'เรียนกรรมการตรวจรับ,';
  const inspectionDateLabel = formatBangkokDate(input.inspectionDate);
  const text = [
    greeting,
    '',
    `ขอแจ้งเตือนกำหนดตรวจรับสำหรับโครงการ ${input.projectTitle}`,
    `วันที่ตรวจรับ: ${inspectionDateLabel}`,
    `เหลือเวลาอีก ${input.remainingDays} วัน`,
    '',
    'กรุณาเตรียมการตรวจรับและดำเนินการตามขั้นตอนที่เกี่ยวข้องให้เรียบร้อย',
    '',
    formatCompanyClosing(),
  ].join('\n');

  return {
    subject,
    text,
  };
};

export const sendHelloTestEmail = async (to?: string | null) => {
  await sendPlainTextEmail({
    to: to?.trim() || '',
    subject: 'NexusProcure test email',
    text: 'hello test email',
  });
};

export const sendRegistrationPendingEmail = async (
  recipient: EmailRecipient
) => {
  await sendPlainTextEmail({
    to: recipient.email,
    subject: 'แจ้งสถานะการลงทะเบียน – อยู่ระหว่างรอการอนุมัติ',
    text: [
      formatPersonGreeting(recipient.fullName),
      '',
      'ขอบคุณสำหรับการลงทะเบียน ระบบได้รับข้อมูลของคุณเรียบร้อยแล้ว',
      '',
      'ขณะนี้อยู่ระหว่างการตรวจสอบโดยผู้ดูแลระบบ (Admin) เมื่อบัญชีของคุณได้รับการอนุมัติเรียบร้อยแล้ว ระบบจะส่งอีเมลแจ้งให้ทราบอีกครั้ง',
      '',
      formatCompanyClosing(),
    ].join('\n'),
  });
};

export const sendRegistrationApprovedEmail = async (
  recipient: EmailRecipient
) => {
  await sendPlainTextEmail({
    to: recipient.email,
    subject: 'บัญชีของคุณได้รับการอนุมัติแล้ว – เข้าสู่ระบบได้ทันที',
    text: [
      formatPersonGreeting(recipient.fullName),
      '',
      'ยินดีด้วย! บัญชีของคุณได้รับการอนุมัติจากผู้ดูแลระบบเรียบร้อยแล้ว',
      '',
      'คุณสามารถเข้าสู่ระบบเพื่อเริ่มใช้งานได้ผ่านลิงก์ด้านล่างนี้:',
      buildLoginUrl(),
      '',
      formatCompanyClosing(),
    ].join('\n'),
  });
};

export const sendVendorPoRequestEmail = async (input: {
  vendorEmail: string;
  vendorName?: string | null;
  poNumber: string;
}) => {
  const vendorLabel = input.vendorName?.trim() || 'บริษัทคู่ค้า';
  await sendPlainTextEmail({
    to: input.vendorEmail,
    subject: `รบกวนส่งเอกสารแนบสำหรับใบสั่งซื้อ PO #${input.poNumber}`,
    text: [
      `เรียน ${vendorLabel},`,
      '',
      `ขอแจ้งรายละเอียดใบสั่งซื้อหมายเลข PO #${input.poNumber} ของท่าน`,
      '',
      'รบกวนทำการแนบไฟล์เอกสารที่เกี่ยวข้องผ่านแบบฟอร์มสำหรับ Vendor ได้ที่ลิงก์นี้:',
      buildVendorFormUrl(),
      '',
      `หมายเหตุ: โปรดระบุหมายเลข PO #${input.poNumber} ทุกครั้งในการส่งเอกสาร`,
      '',
      formatCompanyClosing(),
    ].join('\n'),
  });
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
  await sendPlainTextEmail({
    to: input.recipientEmail,
    subject: content.subject,
    text: content.text,
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

  await sendPlainTextEmail({
    to: recipient.email,
    subject: content.subject,
    text: content.text,
  });
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
      await sendPlainTextEmail({
        to: recipient,
        subject: draft.subject,
        text: draft.body,
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
