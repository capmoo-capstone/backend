import { UnitResponsibleType, UrgentType } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestError, NotFoundError } from '../../lib/errors';
import { prismaMock } from '../../test/prisma-mock';
import {
  calculateTimeline,
  createHoliday,
  deleteHoliday,
  listHolidays,
  updateHoliday,
} from '../holiday.service';

describe('holiday.service – listHolidays', () => {
  it('returns all holidays when no year is given', async () => {
    prismaMock.holiday.findMany.mockResolvedValue([
      { id: 'h-1', date: new Date('2026-01-01'), name: 'วันปีใหม่' },
      { id: 'h-2', date: new Date('2026-04-13'), name: 'วันสงกรานต์' },
    ]);

    const result = await listHolidays();

    expect(result).toHaveLength(2);
    expect(prismaMock.holiday.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} })
    );
  });

  it('filters holidays by year when year is given', async () => {
    prismaMock.holiday.findMany.mockResolvedValue([
      { id: 'h-1', date: new Date('2026-01-01'), name: 'วันปีใหม่' },
    ]);

    const result = await listHolidays(2026);

    expect(result).toHaveLength(1);
    expect(prismaMock.holiday.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          date: {
            gte: new Date('2026-01-01'),
            lte: new Date('2026-12-31'),
          },
        },
        orderBy: { date: 'asc' },
      })
    );
  });
});

describe('holiday.service – createHoliday', () => {
  it('creates a holiday when the date is not already taken', async () => {
    prismaMock.holiday.findUnique.mockResolvedValue(null);
    prismaMock.holiday.create.mockResolvedValue({
      id: 'h-1',
      date: new Date('2026-01-01'),
      name: 'วันปีใหม่',
    });

    const result = await createHoliday({
      date: '2026-01-01',
      name: 'วันปีใหม่',
    });

    expect(result.id).toBe('h-1');
    expect(prismaMock.holiday.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'วันปีใหม่' }),
      })
    );
  });

  it('throws BadRequestError when a holiday on the same date already exists', async () => {
    prismaMock.holiday.findUnique.mockResolvedValue({
      id: 'h-existing',
      date: new Date('2026-01-01'),
      name: 'วันปีใหม่',
    });

    await expect(
      createHoliday({ date: '2026-01-01', name: 'วันปีใหม่ (ซ้ำ)' })
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(prismaMock.holiday.create).not.toHaveBeenCalled();
  });
});

describe('holiday.service – updateHoliday', () => {
  it('updates name only when no date is provided', async () => {
    prismaMock.holiday.findUnique.mockResolvedValue({
      id: 'h-1',
      date: new Date('2026-01-01'),
      name: 'วันปีใหม่',
    });
    prismaMock.holiday.update.mockResolvedValue({
      id: 'h-1',
      date: new Date('2026-01-01'),
      name: 'วันขึ้นปีใหม่',
    });

    const result = await updateHoliday('h-1', { name: 'วันขึ้นปีใหม่' });

    expect(result.name).toBe('วันขึ้นปีใหม่');
    expect(prismaMock.holiday.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'h-1' },
        data: { name: 'วันขึ้นปีใหม่' },
      })
    );
  });

  it('updates both date and name when date is provided and has no duplicate', async () => {
    prismaMock.holiday.findUnique.mockResolvedValue({
      id: 'h-1',
      date: new Date('2026-01-01'),
      name: 'วันปีใหม่',
    });
    prismaMock.holiday.findFirst.mockResolvedValue(null);
    prismaMock.holiday.update.mockResolvedValue({
      id: 'h-1',
      date: new Date('2026-01-02'),
      name: 'วันหยุดชดเชย',
    });

    const result = await updateHoliday('h-1', {
      date: '2026-01-02',
      name: 'วันหยุดชดเชย',
    });

    expect(result.name).toBe('วันหยุดชดเชย');
    expect(prismaMock.holiday.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { not: 'h-1' } }),
      })
    );
  });

  it('throws NotFoundError when the holiday does not exist', async () => {
    prismaMock.holiday.findUnique.mockResolvedValue(null);

    await expect(
      updateHoliday('not-found', { name: 'ใหม่' })
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(prismaMock.holiday.update).not.toHaveBeenCalled();
  });

  it('throws BadRequestError when the new date conflicts with another holiday', async () => {
    prismaMock.holiday.findUnique.mockResolvedValue({
      id: 'h-1',
      date: new Date('2026-01-01'),
      name: 'วันปีใหม่',
    });
    prismaMock.holiday.findFirst.mockResolvedValue({
      id: 'h-other',
      date: new Date('2026-04-13'),
      name: 'วันสงกรานต์',
    });

    await expect(
      updateHoliday('h-1', { date: '2026-04-13' })
    ).rejects.toBeInstanceOf(BadRequestError);

    expect(prismaMock.holiday.update).not.toHaveBeenCalled();
  });
});

describe('holiday.service – deleteHoliday', () => {
  it('deletes the holiday when it exists', async () => {
    prismaMock.holiday.findUnique.mockResolvedValue({
      id: 'h-1',
      date: new Date('2026-01-01'),
      name: 'วันปีใหม่',
    });
    prismaMock.holiday.delete.mockResolvedValue({
      id: 'h-1',
      date: new Date('2026-01-01'),
      name: 'วันปีใหม่',
    });

    const result = await deleteHoliday('h-1');

    expect(result.id).toBe('h-1');
    expect(prismaMock.holiday.delete).toHaveBeenCalledWith({
      where: { id: 'h-1' },
    });
  });

  it('throws NotFoundError when the holiday does not exist', async () => {
    prismaMock.holiday.findUnique.mockResolvedValue(null);

    await expect(deleteHoliday('not-found')).rejects.toBeInstanceOf(
      NotFoundError
    );

    expect(prismaMock.holiday.delete).not.toHaveBeenCalled();
  });
});

describe('holiday.service – calculateTimeline', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-06-29T00:00:00.000Z'));
    prismaMock.holiday.findMany.mockResolvedValue([]);
  });

  it('returns NORMAL urgency and isCustomDate=false when using default date (LT100K, no holidays)', async () => {
    // today = Jun 29 (Mon)
    // addWorkingDays(Jun 29, 30) = Aug 10 (Mon)  [ไม่นับ Jun 29]
    // countWorkingDays(Jun 29, Aug 10) ข้าม Jun 29 → นับ Jun 30–Aug 10 = 30 วันทำการ
    const result = await calculateTimeline({
      unitResponsibilityType: 'LT100K',
    });

    expect(result.unitResponsibilityType).toBe(UnitResponsibleType.LT100K);
    expect(result.isCustomDate).toBe(false);
    expect(result.remainingWorkingDays).toBe(30);
    expect(result.urgentLevel).toBe(UrgentType.NORMAL);
    expect(result.urgencyWarningThreshold).toBe(15);
  });

  it('returns SUPER_URGENT when remaining working days is within LT100K super-urgent threshold (≤3)', async () => {
    // today = Jun 29 (Mon), deliveryDate = Jul 1 (Wed)
    // countWorkingDays(Jun 29, Jul 1): ข้าม Jun 29 → Jun 30(Tue)=1, Jul 1(Wed)=2 = 2 วัน ≤ 3
    const result = await calculateTimeline({
      unitResponsibilityType: 'LT100K',
      deliveryDate: '2026-07-01T00:00:00.000Z',
    });

    expect(result.isCustomDate).toBe(true);
    expect(result.remainingWorkingDays).toBe(2);
    expect(result.urgentLevel).toBe(UrgentType.SUPER_URGENT);
  });

  it('returns VERY_URGENT when remaining working days is within LT100K very-urgent threshold (≤7)', async () => {
    // today = Jun 29 (Mon), deliveryDate = Jul 3 (Fri)
    // countWorkingDays(Jun 29, Jul 3): ข้าม Jun 29 → Jun 30=1, Jul 1=2, Jul 2=3, Jul 3=4 = 4 วัน ≤ 7
    const result = await calculateTimeline({
      unitResponsibilityType: 'LT100K',
      deliveryDate: '2026-07-03T00:00:00.000Z',
    });

    expect(result.remainingWorkingDays).toBe(4);
    expect(result.urgentLevel).toBe(UrgentType.VERY_URGENT);
  });

  it('returns URGENT when remaining working days is within LT100K urgent threshold (≤15)', async () => {
    // today = Jun 29 (Mon), deliveryDate = Jul 10 (Fri)
    // countWorkingDays(Jun 29, Jul 10): ข้าม Jun 29 → Jun 30–Jul 3=4 + Jul 6–10=5 = 9 วัน ≤ 15
    const result = await calculateTimeline({
      unitResponsibilityType: 'LT100K',
      deliveryDate: '2026-07-10T00:00:00.000Z',
    });

    expect(result.remainingWorkingDays).toBe(9);
    expect(result.urgentLevel).toBe(UrgentType.URGENT);
  });

  it('returns 0 remaining working days when delivery date is in the past', async () => {
    const result = await calculateTimeline({
      unitResponsibilityType: 'LT100K',
      deliveryDate: '2026-06-01T00:00:00.000Z',
    });

    expect(result.remainingWorkingDays).toBe(0);
    expect(result.urgentLevel).toBe(UrgentType.SUPER_URGENT);
  });

  it('skips public holidays when counting working days', async () => {
    // today = Jun 29 (Mon), วันหยุด = Jun 30 (Tue), deliveryDate = Jul 2 (Thu)
    // countWorkingDays(Jun 29, Jul 2, {Jun 30}):
    //   ข้าม Jun 29 (start) → ข้าม Jun 30 (holiday) → Jul 1(Wed)=1, Jul 2(Thu)=2 = 2 วันทำการ
    prismaMock.holiday.findMany.mockResolvedValue([
      { date: new Date('2026-06-30T00:00:00.000Z') },
    ]);

    const result = await calculateTimeline({
      unitResponsibilityType: 'LT100K',
      deliveryDate: '2026-07-02T00:00:00.000Z',
    });

    expect(result.remainingWorkingDays).toBe(2);
  });

  it('uses correct quota and urgency threshold for EBIDDING type', async () => {
    // today = Jun 29 (Mon)
    // addWorkingDays(Jun 29, 120) = ไม่นับ Jun 29 → นับ 120 วันทำการ
    // countWorkingDays(Jun 29, deliveryDate): ข้าม Jun 29 → นับ 120 วันทำการพอดี
    const result = await calculateTimeline({
      unitResponsibilityType: 'EBIDDING',
    });

    expect(result.unitResponsibilityType).toBe(UnitResponsibleType.EBIDDING);
    expect(result.remainingWorkingDays).toBe(120);
    expect(result.urgentLevel).toBe(UrgentType.NORMAL);
    expect(result.urgencyWarningThreshold).toBe(90);
  });

  it('uses correct quota, VERY_URGENT and URGENT thresholds for SELECTION type', async () => {
    // default SELECTION quota = 60 working days.
    // Remaining = 60. Since <= 60 (urgent threshold), urgency is URGENT.
    const defaultResult = await calculateTimeline({
      unitResponsibilityType: 'SELECTION',
    });
    expect(defaultResult.unitResponsibilityType).toBe(UnitResponsibleType.SELECTION);
    expect(defaultResult.remainingWorkingDays).toBe(60);
    expect(defaultResult.urgentLevel).toBe(UrgentType.URGENT);
    expect(defaultResult.urgencyWarningThreshold).toBe(60);

    // Remaining = 30 days -> VERY_URGENT (since <= 30)
    // today = Jun 29 (Mon)
    // addWorkingDays(Jun 29, 30) = Aug 10 (Mon)
    const veryUrgentResult = await calculateTimeline({
      unitResponsibilityType: 'SELECTION',
      deliveryDate: '2026-08-10T00:00:00.000Z',
    });
    expect(veryUrgentResult.remainingWorkingDays).toBe(30);
    expect(veryUrgentResult.urgentLevel).toBe(UrgentType.VERY_URGENT);

    // Remaining = 31 days -> URGENT (since <= 60)
    // addWorkingDays(Jun 29, 31) = Aug 11 (Tue)
    const urgentResult = await calculateTimeline({
      unitResponsibilityType: 'SELECTION',
      deliveryDate: '2026-08-11T00:00:00.000Z',
    });
    expect(urgentResult.remainingWorkingDays).toBe(31);
    expect(urgentResult.urgentLevel).toBe(UrgentType.URGENT);

    // Remaining = 61 days -> NORMAL (since > 60)
    // addWorkingDays(Jun 29, 61) = Sep 22 (Tue)
    const normalResult = await calculateTimeline({
      unitResponsibilityType: 'SELECTION',
      deliveryDate: '2026-09-22T00:00:00.000Z',
    });
    expect(normalResult.remainingWorkingDays).toBe(61);
    expect(normalResult.urgentLevel).toBe(UrgentType.NORMAL);
  });
});

