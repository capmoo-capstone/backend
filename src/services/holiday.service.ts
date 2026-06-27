import { Holiday, UnitResponsibleType, UrgentType } from '@prisma/client';
import { prisma } from '../config/prisma';
import { BadRequestError, NotFoundError } from '../lib/errors';
import {
  CalculateTimelineDto,
  CreateHolidayDto,
  UpdateHolidayDto,
} from '../schemas/holiday.schema';
import { TimelineResult } from '../types/holiday.type';

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

const isWeekend = (date: Date): boolean => {
  const day = date.getDay();
  return day === 0 || day === 6;
};

export const getHolidayDates = async (
  from: Date,
  to: Date
): Promise<Set<string>> => {
  const holidays = await prisma.holiday.findMany({
    where: { date: { gte: from, lte: to } },
    select: { date: true },
  });
  return new Set(holidays.map((h) => h.date.toISOString().slice(0, 10)));
};

const countWorkingDays = (
  from: Date,
  to: Date,
  holidaySet: Set<string>
): number => {
  let count = 0;
  const cursor = new Date(from);
  cursor.setUTCHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setUTCHours(0, 0, 0, 0);

  // ไม่นับวันเริ่มต้น (from) เหมือนกับ addWorkingDays
  cursor.setUTCDate(cursor.getUTCDate() + 1);

  while (cursor <= end) {
    const isoDate = cursor.toISOString().slice(0, 10);
    if (!isWeekend(cursor) && !holidaySet.has(isoDate)) {
      count++;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
};

const addWorkingDays = (
  startDate: Date,
  n: number,
  holidaySet: Set<string>
): Date => {
  const cursor = new Date(startDate);
  cursor.setUTCHours(0, 0, 0, 0);
  let remaining = n;

  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const isoDate = cursor.toISOString().slice(0, 10);
    if (!isWeekend(cursor) && !holidaySet.has(isoDate)) {
      remaining--;
    }
  }
  return cursor;
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
          gte: new Date(`${year}-01-01`),
          lte: new Date(`${year}-12-31`),
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

export const createHoliday = async (
  data: CreateHolidayDto
): Promise<Holiday> => {
  const dateValue = new Date(data.date);
  await checkDuplicateDate(dateValue, data.date);

  return prisma.holiday.create({
    data: {
      date: dateValue,
      name: data.name,
    },
  });
};

export const updateHoliday = async (
  id: string,
  data: UpdateHolidayDto
): Promise<Holiday> => {
  await getHolidayOrThrow(id, 'ไม่พบวันหยุดที่ต้องการแก้ไข');

  let dateValue: Date | undefined;
  if (data.date !== undefined) {
    dateValue = new Date(data.date);
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
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const thresholds = URGENCY_THRESHOLDS[unitResponsibilityType];
  const quota = WORKING_DAY_QUOTA[unitResponsibilityType];

  let resolvedDeliveryDate: Date;
  let isCustomDate: boolean;

  if (deliveryDate) {
    resolvedDeliveryDate = new Date(deliveryDate);
    resolvedDeliveryDate.setUTCHours(0, 0, 0, 0);
    isCustomDate = true;
  } else {
    const windowEnd = new Date(today);
    windowEnd.setUTCDate(today.getUTCDate() + quota * 2);
    const holidaySet = await getHolidayDates(today, windowEnd);

    resolvedDeliveryDate = addWorkingDays(today, quota, holidaySet);
    isCustomDate = false;
  }

  const from = today < resolvedDeliveryDate ? today : resolvedDeliveryDate;
  const to = today < resolvedDeliveryDate ? resolvedDeliveryDate : today;
  const holidaySet = await getHolidayDates(from, to);

  const remainingWorkingDays =
    today <= resolvedDeliveryDate
      ? countWorkingDays(today, resolvedDeliveryDate, holidaySet)
      : 0;

  const urgentLevel = resolveUrgencyLevel(remainingWorkingDays, thresholds);

  return {
    unitResponsibilityType: unitResponsibilityType as UnitResponsibleType,
    isCustomDate,
    deliveryDate: resolvedDeliveryDate.toISOString(),
    remainingWorkingDays,
    urgentLevel,
    urgencyWarningThreshold: thresholds.urgent,
  };
};

