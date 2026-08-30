import {
  ProjectInstallmentStatus,
  UnitResponsibleType,
  UserRole,
} from '@prisma/client';
import { beforeEach, describe, expect, it } from 'vitest';
import { prismaMock, resetPrismaMock } from '../../test/prisma-mock';
import type { AuthPayload } from '../../types/auth.type';
import {
  buildDailySummaryAudienceText,
  buildDailySummaryEmailContent,
  formatThaiBuddhistDate,
  getDailySummaryCountsForRole,
  resolveDailySummaryRole,
} from '../notification/daily-summary-email.service';

const OPS_DEPT_ID = 'DEPT-SUP-OPS';
const REPORT_DATE = new Date('2026-08-29T03:00:00.000Z');

const buildUser = (roles: AuthPayload['roles']): AuthPayload => ({
  token: '',
  id: 'user-1',
  username: 'user.one',
  full_name: 'User One',
  email: 'user.one@example.com',
  roles,
  is_delegated: false,
  delegated_by: [],
});

describe('daily-summary-email.service', () => {
  beforeEach(() => {
    resetPrismaMock();
  });

  it('resolves the effective role using current My Task precedence', () => {
    const user = buildUser([
      {
        role: UserRole.GENERAL_STAFF,
        dept_id: OPS_DEPT_ID,
        dept_name: 'OPS',
        unit_id: 'unit-1',
        unit_name: 'Unit One',
      },
      {
        role: UserRole.FINANCE_STAFF,
        dept_id: OPS_DEPT_ID,
        dept_name: 'OPS',
        unit_id: null,
        unit_name: null,
      },
    ]);

    expect(resolveDailySummaryRole(user)).toBe(UserRole.FINANCE_STAFF);
  });

  it('calculates GENERAL_STAFF daily counts from own scope and tab composition', async () => {
    const user = buildUser([
      {
        role: UserRole.GENERAL_STAFF,
        dept_id: OPS_DEPT_ID,
        dept_name: 'OPS',
        unit_id: 'unit-1',
        unit_name: 'Unit One',
      },
    ]);
    prismaMock.unit.findMany.mockResolvedValue([
      {
        id: 'unit-1',
        type: [UnitResponsibleType.LT100K],
      },
    ]);
    prismaMock.project.count
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(6)
      .mockResolvedValueOnce(7);

    const result = await getDailySummaryCountsForRole(
      user,
      UserRole.GENERAL_STAFF,
      REPORT_DATE
    );

    expect(result).toEqual({
      new_count: 2,
      completed_count: 1,
      pending_count: 18,
      urgent_count: 7,
    });

    const whereJson = prismaMock.project.count.mock.calls.map(([arg]) =>
      JSON.stringify(arg.where)
    );
    expect(whereJson).toHaveLength(7);
    expect(whereJson[0]).toContain('created_at');
    expect(whereJson[0]).toContain('assignee_procurement');
    expect(whereJson[1]).toContain('procurement_completed_at');
    expect(whereJson[1]).toContain('contract_completed_at');
    expect(whereJson[2]).toContain('WAITING_ACCEPT');
    expect(whereJson[3]).toContain('IN_PROGRESS');
    expect(whereJson[4]).toContain('REJECTED');
    expect(whereJson[5]).toContain('WAITING_APPROVAL');
    expect(whereJson[6]).toContain('is_urgent');
  });

  it('calculates HEAD_OF_UNIT daily counts from unit scope and current tabs', async () => {
    const user = buildUser([
      {
        role: UserRole.HEAD_OF_UNIT,
        dept_id: OPS_DEPT_ID,
        dept_name: 'OPS',
        unit_id: 'unit-2',
        unit_name: 'Contract Unit',
      },
    ]);
    prismaMock.unit.findMany.mockResolvedValue([
      {
        id: 'unit-2',
        type: [UnitResponsibleType.CONTRACT],
      },
    ]);
    prismaMock.project.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(6);

    const result = await getDailySummaryCountsForRole(
      user,
      UserRole.HEAD_OF_UNIT,
      REPORT_DATE
    );

    expect(result).toEqual({
      new_count: 1,
      completed_count: 2,
      pending_count: 12,
      urgent_count: 6,
    });

    const whereJson = prismaMock.project.count.mock.calls.map(([arg]) =>
      JSON.stringify(arg.where)
    );
    expect(whereJson).toHaveLength(6);
    expect(whereJson[0]).toContain('responsible_unit_id');
    expect(whereJson[2]).toContain('WAITING_APPROVAL');
    expect(whereJson[3]).toContain('WAITING_CANCEL');
    expect(whereJson[4]).toContain('NOT_STARTED');
    expect(whereJson[4]).toContain('REJECTED');
    expect(whereJson[5]).toContain('is_urgent');
  });

  it('calculates DOCUMENT_STAFF daily counts from current global own-project behavior', async () => {
    const user = buildUser([
      {
        role: UserRole.DOCUMENT_STAFF,
        dept_id: OPS_DEPT_ID,
        dept_name: 'OPS',
        unit_id: null,
        unit_name: null,
      },
    ]);
    prismaMock.project.count
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(5);

    const result = await getDailySummaryCountsForRole(
      user,
      UserRole.DOCUMENT_STAFF,
      REPORT_DATE
    );

    expect(result).toEqual({
      new_count: 4,
      completed_count: 3,
      pending_count: 3,
      urgent_count: 5,
    });
    expect(prismaMock.unit.findMany).not.toHaveBeenCalled();

    const whereJson = prismaMock.project.count.mock.calls.map(([arg]) =>
      JSON.stringify(arg.where)
    );
    expect(whereJson).toHaveLength(5);
    expect(whereJson[2]).toContain('WAITING_PROPOSAL');
    expect(whereJson[3]).toContain('WAITING_SIGNATURE');
    expect(whereJson[4]).toContain('is_urgent');
  });

  it('calculates FINANCE_STAFF daily counts from current global own-project behavior', async () => {
    const user = buildUser([
      {
        role: UserRole.FINANCE_STAFF,
        dept_id: OPS_DEPT_ID,
        dept_name: 'OPS',
        unit_id: null,
        unit_name: null,
      },
    ]);
    prismaMock.project.count
      .mockResolvedValueOnce(6)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);

    const result = await getDailySummaryCountsForRole(
      user,
      UserRole.FINANCE_STAFF,
      REPORT_DATE
    );

    expect(result).toEqual({
      new_count: 6,
      completed_count: 5,
      pending_count: 9,
      urgent_count: 1,
    });
    expect(prismaMock.unit.findMany).not.toHaveBeenCalled();

    const whereJson = prismaMock.project.count.mock.calls.map(([arg]) =>
      JSON.stringify(arg.where)
    );
    expect(whereJson).toHaveLength(6);
    expect(whereJson[2]).toContain(ProjectInstallmentStatus.WAITING_EXPORT);
    expect(whereJson[3]).toContain(ProjectInstallmentStatus.REQUEST_EDIT);
    expect(whereJson[4]).toContain('WAITING_CLOSE');
    expect(whereJson[5]).toContain('is_urgent');
  });

  it('renders all-scope, group-scope, and own-scope audience text with Thai date formatting', () => {
    expect(
      buildDailySummaryAudienceText({ role: UserRole.HEAD_OF_DEPARTMENT })
    ).toBe('สถานะโครงการทั้งหมด');
    expect(
      buildDailySummaryAudienceText({ role: UserRole.DOCUMENT_STAFF })
    ).toBe('สถานะโครงการทั้งหมด');
    expect(
      buildDailySummaryAudienceText({
        role: UserRole.HEAD_OF_UNIT,
        unitNames: ['กลุ่มงานพัสดุ'],
      })
    ).toBe('สถานะโครงการของกลุ่มงานพัสดุ');
    expect(
      buildDailySummaryAudienceText({ role: UserRole.GENERAL_STAFF })
    ).toBe('สถานะโครงการที่ท่านรับผิดชอบ');
    expect(formatThaiBuddhistDate(REPORT_DATE)).toBe('29 ส.ค. 2569');

    const content = buildDailySummaryEmailContent({
      fullName: 'ฌามา วจนชัย',
      audienceText: 'สถานะโครงการที่ท่านรับผิดชอบ',
      counts: {
        new_count: 1,
        completed_count: 2,
        pending_count: 0,
        urgent_count: 2,
      },
      reportDate: REPORT_DATE,
      appPublicUrl: 'https://nexus-procure.com',
    });

    expect(content.subject).toBe(
      'สรุปงานในระบบ NexusProcure ประจำวันที่ 29 ส.ค. 2569'
    );
    expect(content.text).toContain('เรียน คุณฌามา วจนชัย');
    expect(content.text).toContain('สถานะโครงการที่ท่านรับผิดชอบ');
    expect(content.text).toContain('งานที่เพิ่มใหม่ทั้งสิ้น 1 โครงการ');
    expect(content.text).toContain('https://nexus-procure.com');
  });
});
