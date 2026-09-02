import { NotificationDeliveryStatus, UserRole } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prismaMock, resetPrismaMock } from '../../test/prisma-mock';
import {
  buildContractCommitteeReminderEmail,
  notificationEmailTransport,
  sendContractCommitteeReminderEmail,
  sendDailySummaryEmailsToSuperAdmins,
  sendHelloTestEmail,
  sendRegistrationApprovedEmail,
  sendRegistrationPendingEmail,
  sendVendorPoRequestEmailForProject,
} from '../notification/notification-email.service';

const FOOTER_NOTICE =
  '(อีเมลฉบับนี้เป็นอีเมลอัตโนมัติ กรุณาอย่าตอบกลับอีเมลฉบับนี้)';

const getSentPayload = (fetchMock: ReturnType<typeof vi.fn>, callIndex = 0) => {
  const [, options] = fetchMock.mock.calls[callIndex] as [
    string,
    { body: string },
  ];
  return JSON.parse(options.body) as {
    from: string;
    to: string[];
    subject: string;
    text: string;
    html?: string;
  };
};

const expectBusinessFooter = (payload: { text: string; html?: string }) => {
  expect(payload.text).toContain('ขอแสดงความนับถือ');
  expect(payload.text).toContain('NexusProcure');
  expect(payload.text).toContain('Connect • Fast • Transparent');
  expect(payload.text).toContain(FOOTER_NOTICE);
  expect(payload.html).toContain('<strong>NexusProcure</strong>');
  expect(payload.html).toContain('Connect • Fast • Transparent');
  expect(payload.html).toContain(
    '<em>(อีเมลฉบับนี้เป็นอีเมลอัตโนมัติ กรุณาอย่าตอบกลับอีเมลฉบับนี้)</em>'
  );
};

describe('notification-email.service', () => {
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalFrom = process.env.RESEND_FROM;
  const originalAppPublicUrl = process.env.APP_PUBLIC_URL;
  const originalVendorAppPublicUrl = process.env.VENDOR_APP_PUBLIC_URL;

  beforeEach(() => {
    resetPrismaMock();
    process.env.RESEND_API_KEY = 're_test';
    process.env.RESEND_FROM = 'NexusProcure <onboarding@resend.dev>';
    process.env.APP_PUBLIC_URL = 'https://nexus-procure.com';
    process.env.VENDOR_APP_PUBLIC_URL = 'https://vendor.nexus-procure.com';
  });

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.RESEND_API_KEY;
    } else {
      process.env.RESEND_API_KEY = originalApiKey;
    }

    if (originalFrom === undefined) {
      delete process.env.RESEND_FROM;
    } else {
      process.env.RESEND_FROM = originalFrom;
    }

    if (originalAppPublicUrl === undefined) {
      delete process.env.APP_PUBLIC_URL;
    } else {
      process.env.APP_PUBLIC_URL = originalAppPublicUrl;
    }

    if (originalVendorAppPublicUrl === undefined) {
      delete process.env.VENDOR_APP_PUBLIC_URL;
    } else {
      process.env.VENDOR_APP_PUBLIC_URL = originalVendorAppPublicUrl;
    }

    vi.unstubAllGlobals();
  });

  it('sends a test email with the explicit recipient', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await sendHelloTestEmail('person@example.com');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer re_test',
          'Content-Type': 'application/json',
        }),
      })
    );

    expect(getSentPayload(fetchMock)).toEqual({
      from: 'NexusProcure <onboarding@resend.dev>',
      to: ['person@example.com'],
      subject: 'NexusProcure test email',
      text: 'hello test email',
    });
  });

  it('requires an explicit recipient for test email', async () => {
    await expect(sendHelloTestEmail()).rejects.toThrow(
      'A recipient email is required'
    );
  });

  it('renders the approved registration email with the login URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await sendRegistrationApprovedEmail({
      fullName: 'Somchai Test',
      email: 'somchai@example.com',
    });

    const payload = getSentPayload(fetchMock);
    expect(payload.subject.length).toBeGreaterThan(0);
    expect(payload.to).toEqual(['somchai@example.com']);
    expect(payload.text).toContain('https://nexus-procure.com/login');
    expect(payload.text).toContain('Somchai Test');
    expect(payload.html).toContain(
      '<a href="https://nexus-procure.com/login">'
    );
    expectBusinessFooter(payload);
  });

  it('renders the pending registration email', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await sendRegistrationPendingEmail({
      fullName: 'Somying Test',
      email: 'somying@example.com',
    });

    const payload = getSentPayload(fetchMock);
    expect(payload.subject.length).toBeGreaterThan(0);
    expect(payload.to).toEqual(['somying@example.com']);
    expect(payload.text).toContain('Somying Test');
    expect(payload.html).toContain('Somying Test');
    expectBusinessFooter(payload);
  });

  it('renders the contract committee reminder email with inspection date and remaining days', () => {
    const content = buildContractCommitteeReminderEmail({
      recipientEmail: 'committee@example.com',
      recipientName: 'Committee Member',
      projectTitle: 'Project Alpha',
      inspectionDate: new Date('2026-08-31T00:00:00.000Z'),
      remainingDays: 5,
    });

    expect(content.subject).toContain('5');
    expect(content.subject).toContain('Project Alpha');
    expect(content.text).toContain('Committee Member');
    expect(content.text).toContain('2026-08-31');
    expect(content.text).toContain('5');
    expect(content.html).toContain('<strong>5</strong>');
    expectBusinessFooter(content);
  });

  it('uses the committee greeting when no recipient name is available', () => {
    const content = buildContractCommitteeReminderEmail({
      recipientEmail: 'committee@example.com',
      projectTitle: 'Project Alpha',
      inspectionDate: new Date('2026-08-31T00:00:00.000Z'),
      remainingDays: 5,
    });

    expect(content.text).toContain('เรียน กรรมการตรวจรับ');
    expect(content.text).not.toContain('เรียน คุณ กรรมการตรวจรับ,');
    expect(content.html).toContain('<p>เรียน กรรมการตรวจรับ</p>');
  });

  it('sends the contract committee reminder email through Resend', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await sendContractCommitteeReminderEmail({
      recipientEmail: 'committee@example.com',
      recipientName: 'Committee Member',
      projectTitle: 'Project Alpha',
      inspectionDate: new Date('2026-08-31T00:00:00.000Z'),
      remainingDays: 5,
    });

    const payload = getSentPayload(fetchMock);
    expect(payload.to).toEqual(['committee@example.com']);
    expect(payload.subject).toContain('5');
    expect(payload.subject).toContain('Project Alpha');
    expect(payload.text).toContain('Committee Member');
    expect(payload.html).toContain('Committee Member');
    expectBusinessFooter(payload);
  });

  it('sends the vendor PO email from project data and includes the vendor form URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    prismaMock.project.findUnique.mockResolvedValue({
      id: 'project-1',
      po_no: 'PO-1234',
      vendor_email: 'vendor@example.com',
      vendor_name: 'Vendor Co., Ltd.',
    });

    const result = await sendVendorPoRequestEmailForProject('project-1');

    expect(result).toEqual({
      projectId: 'project-1',
      poNumber: 'PO-1234',
      recipientEmail: 'vendor@example.com',
    });

    const payload = getSentPayload(fetchMock);
    expect(payload.subject).toContain('PO #PO-1234');
    expect(payload.to).toEqual(['vendor@example.com']);
    expect(payload.text).toContain(
      'https://vendor.nexus-procure.com/vendor-form'
    );
    expect(payload.text).toContain('PO #PO-1234');
    expect(payload.text).toContain('Vendor Co., Ltd.');
    expect(payload.text).toContain('เรียน Vendor Co., Ltd.');
    expect(payload.text).not.toContain('เรียน Vendor Co., Ltd.,');
    expect(payload.html).toContain('<p>เรียน Vendor Co., Ltd.</p>');
    expect(payload.html).toContain(
      '<a href="https://vendor.nexus-procure.com/vendor-form">'
    );
    expectBusinessFooter(payload);
  });

  it('fails clearly when the vendor email is missing from the project', async () => {
    prismaMock.project.findUnique.mockResolvedValue({
      id: 'project-1',
      po_no: 'PO-1234',
      vendor_email: null,
      vendor_name: 'Vendor Co., Ltd.',
    });

    await expect(
      sendVendorPoRequestEmailForProject('project-1')
    ).rejects.toThrow('Project vendor email is missing');
  });

  it('sends one daily summary email per resolved recipient with Thai content and deduplicated email addresses', async () => {
    const reportDate = new Date('2026-08-29T03:00:00.000Z');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    prismaMock.user.findMany.mockResolvedValue([
      {
        id: 'user-1',
        username: 'ops.doc',
        email: 'ops1@example.com',
        full_name: 'Ops Document',
        roles: [
          {
            role: UserRole.DOCUMENT_STAFF,
            department: { id: 'DEPT-SUP-OPS', name: 'OPS' },
            unit: null,
          },
        ],
      },
      {
        id: 'user-2',
        username: 'ops.duplicate',
        email: 'ops1@example.com',
        full_name: 'Ops Duplicate',
        roles: [
          {
            role: UserRole.GENERAL_STAFF,
            department: { id: 'DEPT-SUP-OPS', name: 'OPS' },
            unit: { id: 'unit-1', name: 'Unit One' },
          },
        ],
      },
      {
        id: 'user-3',
        username: 'ops.finance',
        email: 'ops2@example.com',
        full_name: 'Ops Finance',
        roles: [
          {
            role: UserRole.FINANCE_STAFF,
            department: { id: 'DEPT-SUP-OPS', name: 'OPS' },
            unit: null,
          },
        ],
      },
      {
        id: 'user-4',
        username: 'ops.hod',
        email: 'ops3@example.com',
        full_name: 'Ops Head',
        roles: [
          {
            role: UserRole.HEAD_OF_DEPARTMENT,
            department: { id: 'DEPT-SUP-OPS', name: 'OPS' },
            unit: null,
          },
        ],
      },
    ]);
    prismaMock.project.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(6)
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(9)
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(11);

    const result = await sendDailySummaryEmailsToSuperAdmins(reportDate);

    expect(result).toEqual({ recipientCount: 2 });
    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          is_active: true,
          email: { not: null },
          roles: {
            some: {
              role: UserRole.SUPER_ADMIN,
            },
          },
        }),
      })
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const documentPayload = getSentPayload(fetchMock, 0);
    expect(documentPayload.to).toEqual(['ops1@example.com']);
    expect(documentPayload.subject).toBe(
      'สรุปงานในระบบ NexusProcure ประจำวันที่ 29 ส.ค. 2569'
    );
    expect(documentPayload.text).toContain('เรียน คุณOps Document');
    expect(documentPayload.text).toContain('สถานะโครงการทั้งหมด');
    expect(documentPayload.text).toContain('งานที่เพิ่มใหม่ทั้งสิ้น 1 โครงการ');
    expect(documentPayload.text).toContain('งานคงค้างทั้งสิ้น 7 โครงการ');
    expect(documentPayload.text).toContain('https://nexus-procure.com');
    expect(documentPayload.html).toContain('<strong>Ops Document</strong>');
    expectBusinessFooter(documentPayload);

    const financePayload = getSentPayload(fetchMock, 1);
    expect(financePayload.to).toEqual(['ops2@example.com']);
    expect(financePayload.text).toContain('เรียน คุณOps Finance');
    expect(financePayload.text).toContain('สถานะโครงการที่ท่านรับผิดชอบ');
    expect(financePayload.text).toContain('งานที่แล้วเสร็จทั้งสิ้น 7 โครงการ');
    expect(financePayload.text).toContain('งานคงค้างทั้งสิ้น 27 โครงการ');
    expect(financePayload.text).toContain('งานเร่งด่วนทั้งสิ้น 11 โครงการ');
    expect(financePayload.html).toContain('<strong>Ops Finance</strong>');
    expectBusinessFooter(financePayload);
  });

  it('marks queued delivery as sent when Resend accepts it', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const result = await notificationEmailTransport.queue({
      userId: 'user-1',
      channel: 'EMAIL_IMMEDIATE' as any,
      subject: 'Subject',
      body: 'Body',
      recipientEmail: 'person@example.com',
      htmlBody: '<p>Body</p>',
    });

    expect(result.status).toBe(NotificationDeliveryStatus.SENT);
    expect(result.sentAt).toBeInstanceOf(Date);
    expect(result.errorMessage).toBeNull();
    expect(getSentPayload(fetchMock).html).toBe('<p>Body</p>');
  });

  it('skips queued delivery when the recipient email is missing', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const result = await notificationEmailTransport.queue({
      userId: 'user-1',
      channel: 'EMAIL_IMMEDIATE' as any,
      subject: 'Subject',
      body: 'Body',
    });

    expect(result).toEqual({
      status: NotificationDeliveryStatus.SKIPPED,
      errorMessage: 'Recipient email is missing',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('sends the daily summary only to super administrators', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    prismaMock.user.findMany.mockResolvedValue([
      {
        id: 'super-admin-1',
        username: 'super.admin',
        email: 'super@example.com',
        full_name: 'Super Admin',
        roles: [
          {
            role: UserRole.SUPER_ADMIN,
            department: { id: 'DEPT-SUP-OPS', name: 'OPS' },
            unit: null,
          },
        ],
      },
    ]);
    prismaMock.project.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(5);

    const result = await sendDailySummaryEmailsToSuperAdmins(
      new Date('2026-08-29T03:00:00.000Z')
    );

    expect(result).toEqual({ recipientCount: 1 });
    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          roles: { some: { role: UserRole.SUPER_ADMIN } },
        }),
      })
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getSentPayload(fetchMock, 0).to).toEqual(['super@example.com']);
  });
  it('filters daily summaries to a normalized direct-mode allow-list', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    prismaMock.user.findMany.mockResolvedValue([
      {
        id: 'super-admin-1',
        username: 'super.admin',
        email: 'Allowed@Example.com',
        full_name: 'Super Admin',
        roles: [
          {
            role: UserRole.SUPER_ADMIN,
            department: { id: 'DEPT-SUP-OPS', name: 'OPS' },
            unit: null,
          },
        ],
      },
      {
        id: 'super-admin-2',
        username: 'other.admin',
        email: 'other@example.com',
        full_name: 'Other Admin',
        roles: [
          {
            role: UserRole.SUPER_ADMIN,
            department: { id: 'DEPT-SUP-OPS', name: 'OPS' },
            unit: null,
          },
        ],
      },
    ]);
    prismaMock.project.count.mockResolvedValue(0);

    const result = await sendDailySummaryEmailsToSuperAdmins(
      new Date('2026-08-29T03:00:00.000Z'),
      new Set(['allowed@example.com'])
    );

    expect(result).toEqual({ recipientCount: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getSentPayload(fetchMock).to).toEqual(['Allowed@Example.com']);
  });

  it('does not deliver daily summaries when no recipient is allow-listed', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    prismaMock.user.findMany.mockResolvedValue([
      {
        id: 'super-admin-1',
        username: 'super.admin',
        email: 'super@example.com',
        full_name: 'Super Admin',
        roles: [
          {
            role: UserRole.SUPER_ADMIN,
            department: { id: 'DEPT-SUP-OPS', name: 'OPS' },
            unit: null,
          },
        ],
      },
    ]);

    const result = await sendDailySummaryEmailsToSuperAdmins(
      new Date('2026-08-29T03:00:00.000Z'),
      new Set()
    );

    expect(result).toEqual({ recipientCount: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
