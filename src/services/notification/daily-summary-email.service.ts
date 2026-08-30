import { Prisma, UserRole } from '@prisma/client';
import { prisma } from '../../config/prisma';
import {
  buildOwnProjectCompletedDateFilter,
  buildOwnProjectRoleScopes,
  buildOwnProjectRoleTabWhere,
  OwnProjectRole,
  OWN_PROJECT_ACTION_TABS,
} from '../project-query-own.helper';
import { AuthPayload } from '../../types/auth.type';
import { OwnProjectTab } from '../../types/project.type';
import { bangkokDayEndUtc, bangkokDayStartUtc } from '../../utils/date';

const DAILY_SUMMARY_ROLE_PRIORITY = [
  UserRole.HEAD_OF_UNIT,
  UserRole.DOCUMENT_STAFF,
  UserRole.FINANCE_STAFF,
  UserRole.GENERAL_STAFF,
] as const satisfies OwnProjectRole[];

const PENDING_TABS_BY_ROLE: Record<OwnProjectRole, OwnProjectTab[]> = {
  [UserRole.GENERAL_STAFF]: [
    OwnProjectTab.WAITING_ACCEPT,
    OwnProjectTab.NEED_ACTION,
    OwnProjectTab.REJECTED,
    OwnProjectTab.WAITING_OTHERS,
  ],
  [UserRole.HEAD_OF_UNIT]: [
    OwnProjectTab.WAITING_APPROVAL,
    OwnProjectTab.WAITING_CANCEL,
    OwnProjectTab.WAITING_OTHERS,
  ],
  [UserRole.DOCUMENT_STAFF]: [
    OwnProjectTab.WAITING_PROPOSAL,
    OwnProjectTab.WAITING_SIGNATURE,
  ],
  [UserRole.FINANCE_STAFF]: [
    OwnProjectTab.WAITING_FINANCE_EXPORT,
    OwnProjectTab.WAITING_EDIT,
    OwnProjectTab.WAITING_CLOSE_PROJECT,
  ],
};

const thaiBuddhistDateFormatter = new Intl.DateTimeFormat('th-TH', {
  timeZone: 'Asia/Bangkok',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export interface DailySummaryCounts {
  new_count: number;
  completed_count: number;
  pending_count: number;
  urgent_count: number;
}

export interface DailySummaryEmailContentInput {
  fullName: string;
  audienceText: string;
  counts: DailySummaryCounts;
  reportDate: Date;
  appPublicUrl: string;
}

const emptyWhere = (): Prisma.ProjectWhereInput => ({ id: { in: [] } });

const andWhere = (
  ...clauses: Prisma.ProjectWhereInput[]
): Prisma.ProjectWhereInput => {
  const filtered = clauses.filter((clause) => Object.keys(clause).length > 0);
  return filtered.length === 0
    ? {}
    : filtered.length === 1
      ? filtered[0]
      : { AND: filtered };
};

const unique = <T>(values: T[]) => Array.from(new Set(values));

export const formatThaiBuddhistDate = (date: Date) =>
  thaiBuddhistDateFormatter.format(date);

export const resolveDailySummaryRole = (
  user: Pick<AuthPayload, 'roles'>
): OwnProjectRole | null => {
  for (const role of DAILY_SUMMARY_ROLE_PRIORITY) {
    if (user.roles.some((entry) => entry.role === role)) {
      return role;
    }
  }

  return null;
};

export const buildDailySummaryAudienceText = (input: {
  role: UserRole;
  unitNames?: string[];
}) => {
  if (
    input.role === UserRole.HEAD_OF_DEPARTMENT ||
    input.role === UserRole.DOCUMENT_STAFF
  ) {
    return 'สถานะโครงการทั้งหมด';
  }

  if (input.role === UserRole.HEAD_OF_UNIT) {
    const unitNames = unique(
      (input.unitNames ?? []).map((name) => name.trim()).filter(Boolean)
    );
    const unitLabel = unitNames.join(', ');

    if (!unitLabel) {
      return 'สถานะโครงการของกลุ่มงาน';
    }

    return unitLabel.startsWith('กลุ่มงาน')
      ? `สถานะโครงการของ${unitLabel}`
      : `สถานะโครงการของกลุ่มงาน${unitLabel}`;
  }

  return 'สถานะโครงการที่ท่านรับผิดชอบ';
};

export const buildDailySummaryEmailContent = (
  input: DailySummaryEmailContentInput
) => {
  const thaiDate = formatThaiBuddhistDate(input.reportDate);

  return {
    subject: `สรุปงานในระบบ NexusProcure ประจำวันที่ ${thaiDate}`,
    text: [
      `เรียน คุณ${input.fullName}`,
      '',
      `ระบบ NexusProcure ขอส่งรายงาน${input.audienceText} ประจำวันที่ ${thaiDate} ณ เวลา 10:00 น. มีรายละเอียดดังนี้`,
      '',
      `- งานที่เพิ่มใหม่ทั้งสิ้น ${input.counts.new_count} โครงการ`,
      `- งานที่แล้วเสร็จทั้งสิ้น ${input.counts.completed_count} โครงการ`,
      `- งานคงค้างทั้งสิ้น ${input.counts.pending_count} โครงการ`,
      `- งานเร่งด่วนทั้งสิ้น ${input.counts.urgent_count} โครงการ`,
      '',
      `ท่านสามารถเข้าสู่ระบบเพื่อดูรายละเอียดโครงการทั้งหมดได้ที่ ${input.appPublicUrl}`,
      '',
      'ขอแสดงความนับถือ',
      'NexusProcure',
      'Connect • Fast • Transparent',
      '',
      '(อีเมลฉบับนี้เป็นอีเมลอัตโนมัติ กรุณาอย่าตอบกลับอีเมลฉบับนี้)',
    ].join('\n'),
  };
};

export const getDailySummaryCountsForRole = async (
  user: AuthPayload,
  role: OwnProjectRole,
  reportDate: Date = new Date()
): Promise<DailySummaryCounts> => {
  const scopes = await buildOwnProjectRoleScopes(user);
  const scope = scopes.find((entry) => entry.role === role);

  if (!scope) {
    return {
      new_count: 0,
      completed_count: 0,
      pending_count: 0,
      urgent_count: 0,
    };
  }

  const dayStart = bangkokDayStartUtc(reportDate);
  const dayEnd = bangkokDayEndUtc(reportDate);
  const allWhere =
    buildOwnProjectRoleTabWhere(scope, OwnProjectTab.ALL) ?? emptyWhere();
  const completedWhere =
    buildOwnProjectRoleTabWhere(scope, OwnProjectTab.COMPLETED) ?? emptyWhere();
  const urgentWhere =
    buildOwnProjectRoleTabWhere(scope, OwnProjectTab.URGENT) ?? emptyWhere();
  const pendingTabs =
    PENDING_TABS_BY_ROLE[role] ?? OWN_PROJECT_ACTION_TABS[role];
  const pendingWheres = pendingTabs.map(
    (tab) => buildOwnProjectRoleTabWhere(scope, tab) ?? emptyWhere()
  );

  const countQueries = [
    andWhere(allWhere, {
      created_at: {
        gte: dayStart,
        lte: dayEnd,
      },
    }),
    andWhere(
      completedWhere,
      buildOwnProjectCompletedDateFilter(reportDate, reportDate)
    ),
    ...pendingWheres,
    urgentWhere,
  ].map((where) => prisma.project.count({ where }));

  const counts = await prisma.$transaction(countQueries);
  const new_count = counts[0] ?? 0;
  const completed_count = counts[1] ?? 0;
  const urgent_count = counts[counts.length - 1] ?? 0;
  const pending_count = counts
    .slice(2, counts.length - 1)
    .reduce((sum, value) => sum + value, 0);

  return {
    new_count,
    completed_count,
    pending_count,
    urgent_count,
  };
};
