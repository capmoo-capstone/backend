import { NotificationChannel, NotificationDeliveryStatus } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { prismaMock, txMock } from '../../test/prisma-mock';
import { notificationEmailTransport } from '../notification/notification-email.service';
import { sendContractCommitteeReminders } from '../notification/contract-committee-reminder.service';

const buildSubmission = (overrides?: {
  id?: string;
  installmentNo?: number | null;
  submissionRound?: number;
  metaData?: Array<{ field_key: string; value: unknown }>;
  assignees?: Array<{ id: string; email: string | null; full_name: string }>;
  createdBy?: string;
  title?: string;
}) => ({
  id: overrides?.id ?? 'submission-1',
  project_id: 'project-1',
  installment_no: overrides?.installmentNo ?? null,
  submission_round: overrides?.submissionRound ?? 1,
  meta_data:
    overrides?.metaData ??
    [
      { field_key: 'contract_enable_notification', value: true },
      { field_key: 'contract_inspection_date', value: '2026-08-31' },
      { field_key: 'contract_notification_days', value: '[5]' },
      {
        field_key: 'contract_committee_email',
        value: '["committee@example.com"]',
      },
    ],
  project: {
    id: 'project-1',
    title: overrides?.title ?? 'Contract project',
    created_by: overrides?.createdBy ?? 'creator-1',
    assignee_contract: overrides?.assignees ?? [
      {
        id: 'staff-1',
        email: 'staff@example.com',
        full_name: 'Contract Staff',
      },
    ],
  },
});

describe('contract-committee-reminder.service', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('ignores submissions with notifications disabled, missing inspection date, missing committee email, or no selected reminder days', async () => {
    vi.setSystemTime(new Date('2026-08-26T00:00:00.000Z'));
    prismaMock.projectSubmission.findMany.mockResolvedValue([
      buildSubmission({
        id: 'disabled',
        metaData: [
          { field_key: 'contract_enable_notification', value: false },
          { field_key: 'contract_inspection_date', value: '2026-08-31' },
          { field_key: 'contract_notification_days', value: '[5]' },
          {
            field_key: 'contract_committee_email',
            value: '["committee@example.com"]',
          },
        ],
      }),
      buildSubmission({
        id: 'missing-date',
        metaData: [
          { field_key: 'contract_enable_notification', value: true },
          { field_key: 'contract_notification_days', value: '[5]' },
          {
            field_key: 'contract_committee_email',
            value: '["committee@example.com"]',
          },
        ],
      }),
      buildSubmission({
        id: 'missing-committee',
        metaData: [
          { field_key: 'contract_enable_notification', value: true },
          { field_key: 'contract_inspection_date', value: '2026-08-31' },
          { field_key: 'contract_notification_days', value: '[5]' },
        ],
      }),
      buildSubmission({
        id: 'missing-days',
        metaData: [
          { field_key: 'contract_enable_notification', value: true },
          { field_key: 'contract_inspection_date', value: '2026-08-31' },
          {
            field_key: 'contract_committee_email',
            value: '["committee@example.com"]',
          },
        ],
      }),
    ]);

    const queueSpy = vi.spyOn(notificationEmailTransport, 'queue');

    const result = await sendContractCommitteeReminders();

    expect(result).toEqual({
      matchedSubmissionCount: 0,
      recipientCount: 0,
      deliveryCount: 0,
    });
    expect(queueSpy).not.toHaveBeenCalled();
  });

  it('sends only on exact configured lead times to committee and assignee_contract recipients', async () => {
    vi.setSystemTime(new Date('2026-08-26T00:00:00.000Z'));
    prismaMock.projectSubmission.findMany.mockResolvedValue([buildSubmission()]);
    vi.spyOn(notificationEmailTransport, 'queue').mockResolvedValue({
      status: NotificationDeliveryStatus.SENT,
      sentAt: new Date('2026-08-26T00:00:00.000Z'),
      errorMessage: null,
    });
    txMock.notificationDelivery.findFirst.mockResolvedValue(null);
    txMock.notificationDelivery.create.mockImplementation(async ({ data }) => ({
      id: String(data.dedupe_key),
      ...data,
    }));
    prismaMock.notificationDelivery.update.mockResolvedValue(undefined);

    const result = await sendContractCommitteeReminders();

    expect(prismaMock.projectSubmission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workflow_type: 'CONTRACT',
          step_order: 1,
          submission_type: 'STAFF',
          status: 'COMPLETED',
        }),
      })
    );
    expect(result).toEqual({
      matchedSubmissionCount: 1,
      recipientCount: 2,
      deliveryCount: 2,
    });
    expect(notificationEmailTransport.queue).toHaveBeenCalledTimes(2);
    expect(notificationEmailTransport.queue).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'staff-1',
        channel: NotificationChannel.EMAIL_IMMEDIATE,
        recipientEmail: 'staff@example.com',
      })
    );
    expect(notificationEmailTransport.queue).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'creator-1',
        channel: NotificationChannel.EMAIL_IMMEDIATE,
        recipientEmail: 'committee@example.com',
      })
    );
    expect(prismaMock.notificationDelivery.update).toHaveBeenCalledTimes(2);
  });

  it('deduplicates committee and contract staff recipients by email address', async () => {
    vi.setSystemTime(new Date('2026-08-26T00:00:00.000Z'));
    prismaMock.projectSubmission.findMany.mockResolvedValue([
      buildSubmission({
        assignees: [
          {
            id: 'staff-1',
            email: 'committee@example.com',
            full_name: 'Contract Staff',
          },
          {
            id: 'staff-2',
            email: 'staff2@example.com',
            full_name: 'Contract Staff Two',
          },
        ],
      }),
    ]);
    vi.spyOn(notificationEmailTransport, 'queue').mockResolvedValue({
      status: NotificationDeliveryStatus.SENT,
      sentAt: new Date('2026-08-26T00:00:00.000Z'),
      errorMessage: null,
    });
    txMock.notificationDelivery.findFirst.mockResolvedValue(null);
    txMock.notificationDelivery.create.mockImplementation(async ({ data }) => ({
      id: String(data.dedupe_key),
      ...data,
    }));
    prismaMock.notificationDelivery.update.mockResolvedValue(undefined);

    const result = await sendContractCommitteeReminders();

    expect(result).toEqual({
      matchedSubmissionCount: 1,
      recipientCount: 2,
      deliveryCount: 2,
    });
    expect(notificationEmailTransport.queue).toHaveBeenCalledTimes(2);
  });

  it('does not resend when a matching notification delivery already exists', async () => {
    vi.setSystemTime(new Date('2026-08-26T00:00:00.000Z'));
    prismaMock.projectSubmission.findMany.mockResolvedValue([
      buildSubmission({ assignees: [] }),
    ]);
    const queueSpy = vi.spyOn(notificationEmailTransport, 'queue');
    txMock.notificationDelivery.findFirst.mockResolvedValue({ id: 'delivery-1' });

    const result = await sendContractCommitteeReminders();

    expect(result).toEqual({
      matchedSubmissionCount: 1,
      recipientCount: 1,
      deliveryCount: 0,
    });
    expect(queueSpy).not.toHaveBeenCalled();
  });

  it('uses only the latest submission round for each project installment', async () => {
    vi.setSystemTime(new Date('2026-08-26T00:00:00.000Z'));
    prismaMock.projectSubmission.findMany.mockResolvedValue([
      buildSubmission({
        id: 'latest-round',
        submissionRound: 2,
        metaData: [
          { field_key: 'contract_enable_notification', value: true },
          { field_key: 'contract_inspection_date', value: '2026-08-31' },
          { field_key: 'contract_notification_days', value: '[5]' },
          {
            field_key: 'contract_committee_email',
            value: '["latest@example.com"]',
          },
        ],
      }),
      buildSubmission({
        id: 'older-round',
        submissionRound: 1,
        metaData: [
          { field_key: 'contract_enable_notification', value: true },
          { field_key: 'contract_inspection_date', value: '2026-08-31' },
          { field_key: 'contract_notification_days', value: '[5]' },
          {
            field_key: 'contract_committee_email',
            value: '["older@example.com"]',
          },
        ],
      }),
    ]);
    vi.spyOn(notificationEmailTransport, 'queue').mockResolvedValue({
      status: NotificationDeliveryStatus.SENT,
      sentAt: new Date('2026-08-26T00:00:00.000Z'),
      errorMessage: null,
    });
    txMock.notificationDelivery.findFirst.mockResolvedValue(null);
    txMock.notificationDelivery.create.mockImplementation(async ({ data }) => ({
      id: String(data.dedupe_key),
      ...data,
    }));
    prismaMock.notificationDelivery.update.mockResolvedValue(undefined);

    await sendContractCommitteeReminders();

    expect(notificationEmailTransport.queue).toHaveBeenCalledTimes(2);
    expect(notificationEmailTransport.queue).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmail: 'latest@example.com',
      })
    );
    expect(notificationEmailTransport.queue).not.toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmail: 'older@example.com',
      })
    );
  });

  it('persists reservations before delivery and records the final send result afterward', async () => {
    vi.setSystemTime(new Date('2026-08-26T00:00:00.000Z'));
    prismaMock.projectSubmission.findMany.mockResolvedValue([
      buildSubmission({ assignees: [] }),
    ]);
    vi.spyOn(notificationEmailTransport, 'queue').mockResolvedValue({
      status: NotificationDeliveryStatus.FAILED,
      sentAt: null,
      errorMessage: 'SMTP timeout',
    });
    txMock.notificationDelivery.findFirst.mockResolvedValue(null);
    txMock.notificationDelivery.create.mockResolvedValue({
      id: 'reserved-delivery',
    });
    prismaMock.notificationDelivery.update.mockResolvedValue(undefined);

    const result = await sendContractCommitteeReminders();

    expect(result).toEqual({
      matchedSubmissionCount: 1,
      recipientCount: 1,
      deliveryCount: 1,
    });
    expect(txMock.notificationDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: NotificationDeliveryStatus.PENDING,
        }),
      })
    );
    expect(prismaMock.notificationDelivery.update).toHaveBeenCalledWith({
      where: { id: 'reserved-delivery' },
      data: {
        status: NotificationDeliveryStatus.FAILED,
        error_message: 'SMTP timeout',
        sent_at: null,
      },
    });
  });
});
