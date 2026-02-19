import { UnitResponsibleType } from '@prisma/client';

export const SUPPLY_DEPT_ID = 'DEPT-SUP-OPS';

export const WORKFLOW_STEP_ORDERS: Record<UnitResponsibleType, number[]> = {
  [UnitResponsibleType.LT100K]: [1, 2, 3, 4],
  [UnitResponsibleType.LT500K]: [1, 2, 3, 4],
  [UnitResponsibleType.MT500K]: [1, 2, 3, 4, 5, 6],
  [UnitResponsibleType.SELECTION]: [1, 2, 3, 4, 5, 6, 7],
  [UnitResponsibleType.EBIDDING]: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  [UnitResponsibleType.CONTRACT]: [1, 2, 3, 4, 5, 6, 7],
  [UnitResponsibleType.INTERNAL]: [1, 2, 3, 4],
};
