import {
  NotificationChannel,
  NotificationDeliveryStatus,
} from '@prisma/client';
import { prisma } from '../../config/prisma';
import { activeUserWhere } from '../../lib/active-state';
import { OPS_DEPT_ID } from '../../lib/constant';
import { BadRequestError, NotFoundError } from '../../lib/errors';

const RESEND_API_URL = 'https://api.resend.com/emails';
const COMPANY_NAME = 'NexusProcure';

type ResendEmailPayload = {
  from: string;
  to: string[];
  subject: string;
  text: string;
  reply_to?: string;
};

type EmailRecipient = {
  email: string;
  fullName: string;
};

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
  replyTo: process.env.RESEND_REPLY_TO?.trim() || '',
  testTo: process.env.RESEND_TEST_TO?.trim() || '',
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
const buildVendorFormUrl = () => `${getAppPublicUrl()}/vendor-form`;

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
  const { apiKey, from, replyTo } = getResendConfig();
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
    ...(replyTo ? { reply_to: replyTo } : {}),
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

export const sendHelloTestEmail = async (to?: string | null) => {
  const { testTo } = getResendConfig();
  const recipient = to?.trim() || testTo;

  await sendPlainTextEmail({
    to: recipient,
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

export const sendDailySummaryEmail = async (recipient: EmailRecipient) => {
  await sendPlainTextEmail({
    to: recipient.email,
    subject: `สวัสดีตอนเช้าจาก ${COMPANY_NAME}!`,
    text: [
      `สวัสดีตอนเช้าครับ/ค่ะ คุณ ${recipient.fullName}`,
      '',
      'ขอให้วันนี้เป็นวันที่ดีและเริ่มต้นการทำงานอย่างมีความสุขครับ/ค่ะ',
      '',
      'ด้วยความปรารถนาดี',
      '',
      `ทีมงาน ${COMPANY_NAME}`,
    ].join('\n'),
  });
};

export const sendDailySummaryEmailsToOpsUsers = async () => {
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
      email: true,
      full_name: true,
    },
  });

  const recipients = dedupeRecipientsByEmail(
    users.flatMap((user) =>
      user.email
        ? [
            {
              id: user.id,
              email: user.email,
              fullName: user.full_name,
            },
          ]
        : []
    )
  );

  for (const recipient of recipients) {
    await sendDailySummaryEmail(recipient);
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
