import {
  NotificationChannel,
  NotificationDeliveryStatus,
  Prisma,
  SubmissionStatus,
  SubmissionType,
  UnitResponsibleType,
} from '@prisma/client';
import { prisma } from '../../config/prisma';
import {
  formatBangkokDate,
  nowUtc,
  parseBangkokDateTime,
} from '../../lib/date';
import { wholeDayDiff } from './notification-core.service';
import {
  buildContractCommitteeReminderEmail,
  notificationEmailTransport,
} from './notification-email.service';

const CONTRACT_COMMITTEE_EMAIL_KEY = 'contract_committee_email';
const CONTRACT_ENABLE_NOTIFICATION_KEY = 'contract_enable_notification';
const CONTRACT_INSPECTION_DATE_KEY = 'contract_inspection_date';
const CONTRACT_NOTIFICATION_DAYS_KEY = 'contract_notification_days';
const SUPPORTED_LEAD_TIMES = new Set([3, 5, 7, 15]);

type SubmissionMetaItem = {
  field_key?: unknown;
  value?: unknown;
};

type ReminderRecipient = {
  email: string;
  name?: string | null;
  userId: string;
};

type PendingReminderDelivery = {
  deliveryId: string;
  userId: string;
  recipientEmail: string;
  subject: string;
  body: string;
};

const normalizeEmail = (value: string) => value.trim().toLowerCase();

const isUniqueConstraintError = (error: unknown) =>
  Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );

const isMetaItem = (value: unknown): value is SubmissionMetaItem =>
  Boolean(value) && typeof value === 'object';

const getMetaValue = (metaData: unknown[], fieldKey: string) => {
  for (const item of metaData) {
    if (!isMetaItem(item)) {
      continue;
    }

    if (item.field_key === fieldKey) {
      return item.value;
    }
  }

  return undefined;
};

const parseBooleanValue = (value: unknown) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false') {
      return false;
    }
  }

  return false;
};

const parseJsonArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return [];
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const parseNumberArray = (value: unknown) =>
  Array.from(
    new Set(
      parseJsonArray(value)
        .map((item) =>
          typeof item === 'number'
            ? item
            : typeof item === 'string'
              ? Number(item)
              : Number.NaN
        )
        .filter(
          (item): item is number =>
            Number.isInteger(item) && SUPPORTED_LEAD_TIMES.has(item)
        )
    )
  );

const parseEmailArray = (value: unknown) =>
  Array.from(
    new Set(
      parseJsonArray(value)
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );

const parseInspectionDate = (value: unknown) => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  try {
    return parseBangkokDateTime(value);
  } catch {
    return null;
  }
};

const buildReminderRecipients = (input: {
  committeeEmails: string[];
  assignees: Array<{ id: string; email: string | null; full_name: string }>;
  fallbackUserId: string;
}) => {
  const recipients = new Map<string, ReminderRecipient>();

  for (const assignee of input.assignees) {
    if (!assignee.email) {
      continue;
    }

    recipients.set(normalizeEmail(assignee.email), {
      email: assignee.email,
      name: assignee.full_name,
      userId: assignee.id,
    });
  }

  for (const committeeEmail of input.committeeEmails) {
    const key = normalizeEmail(committeeEmail);
    if (recipients.has(key)) {
      continue;
    }

    recipients.set(key, {
      email: committeeEmail,
      name: 'กรรมการตรวจรับ',
      userId: input.fallbackUserId,
    });
  }

  return Array.from(recipients.values());
};

const buildDeliveryDedupeKey = (input: {
  projectId: string;
  installmentNo: number | null;
  inspectionDate: Date;
  remainingDays: number;
  email: string;
}) =>
  [
    'contract-committee-reminder',
    input.projectId,
    input.installmentNo ?? 'none',
    `${input.remainingDays}d`,
    formatBangkokDate(input.inspectionDate),
    normalizeEmail(input.email),
  ].join(':');

const buildSubmissionGroupKey = (input: {
  projectId: string;
  installmentNo: number | null;
}) => `${input.projectId}:${input.installmentNo ?? 'none'}`;

const reserveReminderDelivery = async (input: {
  tx: Prisma.TransactionClient;
  userId: string;
  dedupeKey: string;
  subject: string;
  body: string;
}) => {
  const existing = await input.tx.notificationDelivery.findFirst({
    where: {
      user_id: input.userId,
      channel: NotificationChannel.EMAIL_IMMEDIATE,
      dedupe_key: input.dedupeKey,
      status: {
        in: [
          NotificationDeliveryStatus.PENDING,
          NotificationDeliveryStatus.SENT,
          NotificationDeliveryStatus.SKIPPED,
        ],
      },
    },
    select: { id: true },
  });

  if (existing) {
    return null;
  }

  try {
    return await input.tx.notificationDelivery.create({
      data: {
        user_id: input.userId,
        channel: NotificationChannel.EMAIL_IMMEDIATE,
        subject: input.subject,
        body: input.body,
        dedupe_key: input.dedupeKey,
        status: NotificationDeliveryStatus.PENDING,
      },
      select: { id: true },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    return null;
  }
};

export const sendContractCommitteeReminders = async () => {
  const submissions = await prisma.projectSubmission.findMany({
    where: {
      workflow_type: UnitResponsibleType.CONTRACT,
      step_order: 1,
      submission_type: SubmissionType.STAFF,
      status: SubmissionStatus.COMPLETED,
    },
    orderBy: [
      { project_id: 'asc' },
      { installment_no: 'asc' },
      { submission_round: 'desc' },
      { completed_at: 'desc' },
      { submitted_at: 'desc' },
    ],
    select: {
      id: true,
      project_id: true,
      installment_no: true,
      submission_round: true,
      meta_data: true,
      project: {
        select: {
          id: true,
          title: true,
          created_by: true,
          assignee_contract: {
            select: {
              id: true,
              email: true,
              full_name: true,
            },
          },
        },
      },
    },
  });

  const latestSubmissions = Array.from(
    submissions
      .reduce((map, submission) => {
        const key = buildSubmissionGroupKey({
          projectId: submission.project_id,
          installmentNo: submission.installment_no,
        });

        if (!map.has(key)) {
          map.set(key, submission);
        }

        return map;
      }, new Map<string, (typeof submissions)[number]>())
      .values()
  );

  let matchedSubmissionCount = 0;
  let recipientCount = 0;
  let deliveryCount = 0;
  const now = nowUtc();

  for (const submission of latestSubmissions) {
    const metaData = Array.isArray(submission.meta_data)
      ? submission.meta_data
      : [];
    const notificationsEnabled = parseBooleanValue(
      getMetaValue(metaData, CONTRACT_ENABLE_NOTIFICATION_KEY)
    );

    if (!notificationsEnabled) {
      continue;
    }

    const inspectionDate = parseInspectionDate(
      getMetaValue(metaData, CONTRACT_INSPECTION_DATE_KEY)
    );
    if (!inspectionDate) {
      continue;
    }

    const notificationDays = parseNumberArray(
      getMetaValue(metaData, CONTRACT_NOTIFICATION_DAYS_KEY)
    );
    if (notificationDays.length === 0) {
      continue;
    }

    const committeeEmails = parseEmailArray(
      getMetaValue(metaData, CONTRACT_COMMITTEE_EMAIL_KEY)
    );
    if (committeeEmails.length === 0) {
      continue;
    }

    const remainingDays = wholeDayDiff(inspectionDate, now);
    if (!notificationDays.includes(remainingDays)) {
      continue;
    }

    const recipients = buildReminderRecipients({
      committeeEmails,
      assignees: submission.project.assignee_contract,
      fallbackUserId: submission.project.created_by,
    });
    if (recipients.length === 0) {
      continue;
    }

    matchedSubmissionCount += 1;
    recipientCount += recipients.length;
    const pendingDeliveries: PendingReminderDelivery[] = [];

    await prisma.$transaction(async (tx) => {
      for (const recipient of recipients) {
        const dedupeKey = buildDeliveryDedupeKey({
          projectId: submission.project_id,
          installmentNo: submission.installment_no,
          inspectionDate,
          remainingDays,
          email: recipient.email,
        });

        const recipientContent = buildContractCommitteeReminderEmail({
          recipientEmail: recipient.email,
          recipientName: recipient.name,
          projectTitle: submission.project.title,
          inspectionDate,
          remainingDays,
        });

        const reservedDelivery = await reserveReminderDelivery({
          tx,
          userId: recipient.userId,
          dedupeKey,
          subject: recipientContent.subject,
          body: recipientContent.text,
        });

        if (!reservedDelivery) {
          continue;
        }

        pendingDeliveries.push({
          deliveryId: reservedDelivery.id,
          userId: recipient.userId,
          recipientEmail: recipient.email,
          subject: recipientContent.subject,
          body: recipientContent.text,
        });
      }
    });

    for (const pendingDelivery of pendingDeliveries) {
      const result = await notificationEmailTransport.queue({
        userId: pendingDelivery.userId,
        channel: NotificationChannel.EMAIL_IMMEDIATE,
        subject: pendingDelivery.subject,
        body: pendingDelivery.body,
        recipientEmail: pendingDelivery.recipientEmail,
      });

      await prisma.notificationDelivery.update({
        where: { id: pendingDelivery.deliveryId },
        data: {
          status: result.status,
          error_message: result.errorMessage ?? null,
          sent_at: result.sentAt ?? null,
        },
      });

      deliveryCount += 1;
    }
  }

  return {
    matchedSubmissionCount,
    recipientCount,
    deliveryCount,
  };
};
