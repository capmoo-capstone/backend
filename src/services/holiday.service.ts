import { Holiday, UnitResponsibleType, UrgentType } from '@prisma/client';
import { prisma } from '../config/prisma';
import { DAY_MS } from '../lib/constant';
import {
  addBangkokDays,
  bangkokDayStartUtc,
  bangkokTodayStartUtc,
  bangkokWeekday,
  formatBangkokDate,
  formatBangkokOffset,
} from '../lib/date';
import { BadRequestError, NotFoundError } from '../lib/errors';
import {
  CalculateTimelineDto,
  CreateHolidayDto,
  UpdateHolidayDto,
} from '../schemas/holiday.schema';
import { TimelineResult } from '../types/holiday.type';

export type BangkokWorkingDayHolidayIndex = {
  weekdayHolidayDates: string[];
};

export const isBangkokWeekend = (date: Date): boolean => {
  const day = bangkokWeekday(date);
  return day === 0 || day === 6;
};

export const createBangkokWorkingDayHolidayIndex = (
  holidayDates: Set<string> | BangkokWorkingDayHolidayIndex
): BangkokWorkingDayHolidayIndex => {
  if (
    holidayDates &&
    typeof holidayDates === 'object' &&
    'weekdayHolidayDates' in holidayDates
  ) {
    return holidayDates;
  }

  const sortedWeekdayHolidays: string[] = [];
  if (holidayDates instanceof Set) {
    for (const dateStr of holidayDates) {
      const d = new Date(`${dateStr}T00:00:00.000+07:00`);
      if (!isBangkokWeekend(d)) {
        sortedWeekdayHolidays.push(dateStr);
      }
    }
    sortedWeekdayHolidays.sort();
  }

  return { weekdayHolidayDates: sortedWeekdayHolidays };
};

export const countBangkokWeekendDays = (
  startWeekday: number,
  calendarDays: number
): number => {
  const fullWeeks = Math.floor(calendarDays / 7);
  const remainder = calendarDays % 7;

  let weekends = fullWeeks * 2;
  if (remainder > 0) {
    const distToSat = (6 - startWeekday + 7) % 7 || 7;
    const distToSun = (0 - startWeekday + 7) % 7 || 7;
    if (distToSat <= remainder) weekends++;
    if (distToSun <= remainder) weekends++;
  }

  return weekends;
};

export const countBangkokWorkingDays = (
  from: Date,
  to: Date,
  holidayDates: Set<string> | BangkokWorkingDayHolidayIndex
): number => {
  const start = bangkokDayStartUtc(from);
  const end = bangkokDayStartUtc(to);
  if (start >= end) {
    return 0;
  }

  const calendarDays = Math.floor((end.getTime() - start.getTime()) / DAY_MS);
  const startWeekday = bangkokWeekday(start);
  const weekends = countBangkokWeekendDays(startWeekday, calendarDays);

  const index = createBangkokWorkingDayHolidayIndex(holidayDates);
  const weekdayHolidays = index.weekdayHolidayDates.length;

  return Math.max(0, calendarDays - weekends - weekdayHolidays);
};

export const addBangkokWorkingDays = (
  startDate: Date,
  workingDays: number,
  holidayDates: Set<string> | BangkokWorkingDayHolidayIndex
): Date => {
  const index = createBangkokWorkingDayHolidayIndex(holidayDates);
  const holidaySet = new Set(index.weekdayHolidayDates);

  let cursor = bangkokDayStartUtc(startDate);
  let remaining = workingDays;

  while (remaining > 0) {
    cursor = addBangkokDays(cursor, 1);
    const iso = formatBangkokDate(cursor);
    if (!isBangkokWeekend(cursor) && !holidaySet.has(iso)) {
      remaining--;
    }
  }

  return cursor;
};

const WORKING_DAY_QUOTA: Record<string, number> = {
  LT100K: 30,
  INTERNAL: 30,
  LT500K: 60,
  MT500K: 60,
  SELECTION: 60,
  EBIDDING: 120,
};

interface UrgencyThresholds {
  superUrgent?: number;
  veryUrgent?: number;
  urgent: number;
}

const URGENCY_THRESHOLDS: Record<string, UrgencyThresholds> = {
  LT100K: { superUrgent: 3, veryUrgent: 7, urgent: 15 },
  INTERNAL: { veryUrgent: 7, urgent: 15 },
  LT500K: { superUrgent: 3, veryUrgent: 15, urgent: 30 },
  MT500K: { veryUrgent: 15, urgent: 30 },
  SELECTION: { veryUrgent: 30, urgent: 60 },
  EBIDDING: { veryUrgent: 60, urgent: 90 },
};

const parseHolidayDate = (date: string): Date =>
  new Date(`${date}T00:00:00.000Z`);

export const getHolidayDates = async (
  from: Date,
  to: Date
): Promise<Set<string>> => {
  const holidays = await prisma.holiday.findMany({
    where: { date: { gte: from, lte: to } },
    select: { date: true },
  });
  return new Set(holidays.map((h) => formatBangkokDate(h.date)));
};

const resolveUrgencyLevel = (
  remaining: number,
  thresholds: UrgencyThresholds
): UrgentType => {
  if (
    thresholds.superUrgent !== undefined &&
    remaining <= thresholds.superUrgent
  ) {
    return UrgentType.SUPER_URGENT;
  }
  if (
    thresholds.veryUrgent !== undefined &&
    remaining <= thresholds.veryUrgent
  ) {
    return UrgentType.VERY_URGENT;
  }
  if (remaining <= thresholds.urgent) {
    return UrgentType.URGENT;
  }
  return UrgentType.NORMAL;
};

export const listHolidays = async (year?: number): Promise<Holiday[]> => {
  const where = year
    ? {
        date: {
          gte: parseHolidayDate(`${year}-01-01`),
          lte: parseHolidayDate(`${year}-12-31`),
        },
      }
    : {};

  return prisma.holiday.findMany({
    where,
    orderBy: { date: 'asc' },
  });
};

const getHolidayOrThrow = async (
  id: string,
  errorMessage = 'ไม่พบข้อมูลวันหยุดในระบบ'
): Promise<Holiday> => {
  const holiday = await prisma.holiday.findUnique({ where: { id } });
  if (!holiday) {
    throw new NotFoundError(errorMessage);
  }
  return holiday;
};

const checkDuplicateDate = async (
  date: Date,
  dateStr: string,
  excludeId?: string
): Promise<void> => {
  const existing =
    excludeId !== undefined
      ? await prisma.holiday.findFirst({
          where: {
            date,
            id: { not: excludeId },
          },
        })
      : await prisma.holiday.findUnique({
          where: { date },
        });

  if (existing) {
    throw new BadRequestError(`วันหยุดในวันที่ ${dateStr} มีอยู่ในระบบแล้ว`);
  }
};

export const createHolidays = async (
  items: CreateHolidayDto[]
): Promise<Holiday[]> => {
  await Promise.all(
    items.map((item) =>
      checkDuplicateDate(parseHolidayDate(item.date), item.date)
    )
  );

  return prisma.holiday.createManyAndReturn({
    data: items.map((item) => ({
      date: parseHolidayDate(item.date),
      name: item.name,
    })),
  });
};

export const updateHoliday = async (
  id: string,
  data: UpdateHolidayDto
): Promise<Holiday> => {
  await getHolidayOrThrow(id, 'ไม่พบวันหยุดที่ต้องการแก้ไข');

  let dateValue: Date | undefined;
  if (data.date !== undefined) {
    dateValue = parseHolidayDate(data.date);
    await checkDuplicateDate(dateValue, data.date, id);
  }

  return prisma.holiday.update({
    where: { id },
    data: {
      ...(dateValue !== undefined && { date: dateValue }),
      ...(data.name !== undefined && { name: data.name }),
    },
  });
};

export const deleteHoliday = async (id: string): Promise<Holiday> => {
  await getHolidayOrThrow(id, 'ไม่พบวันหยุดที่ต้องการลบ');
  return prisma.holiday.delete({ where: { id } });
};

export const calculateTimeline = async (
  dto: CalculateTimelineDto
): Promise<TimelineResult> => {
  const { unitResponsibilityType, deliveryDate } = dto;
  const today = bangkokTodayStartUtc();

  const thresholds = URGENCY_THRESHOLDS[unitResponsibilityType];
  const quota = WORKING_DAY_QUOTA[unitResponsibilityType];

  let resolvedDeliveryDate: Date;
  let isCustomDate: boolean;

  if (deliveryDate) {
    resolvedDeliveryDate = bangkokDayStartUtc(deliveryDate);
    isCustomDate = true;
  } else {
    const windowEnd = addBangkokDays(today, quota * 2);
    const holidaySet = await getHolidayDates(today, windowEnd);

    resolvedDeliveryDate = addBangkokWorkingDays(
      today,
      quota,
      createBangkokWorkingDayHolidayIndex(holidaySet)
    );
    isCustomDate = false;
  }

  const from = today < resolvedDeliveryDate ? today : resolvedDeliveryDate;
  const to = today < resolvedDeliveryDate ? resolvedDeliveryDate : today;
  const holidaySet = await getHolidayDates(from, to);
  const holidayIndex = createBangkokWorkingDayHolidayIndex(holidaySet);

  const remainingWorkingDays =
    today <= resolvedDeliveryDate
      ? countBangkokWorkingDays(today, resolvedDeliveryDate, holidayIndex)
      : 0;

  const urgentLevel = resolveUrgencyLevel(remainingWorkingDays, thresholds);

  return {
    unitResponsibilityType: unitResponsibilityType as UnitResponsibleType,
    isCustomDate,
    deliveryDate: formatBangkokOffset(resolvedDeliveryDate),
    remainingWorkingDays,
    urgentLevel,
    urgencyWarningThreshold: thresholds.urgent,
  };
};
