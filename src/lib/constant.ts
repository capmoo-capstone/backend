import { ProjectStatus, UnitResponsibleType } from '@prisma/client';

export const OPS_DEPT_ID = 'DEPT-SUP-OPS';
export const PROC1_UNIT_ID = 'UNIT-PROC-1';
export const PROC2_UNIT_ID = 'UNIT-PROC-2';
export const CONTRACT_UNIT_ID = 'UNIT-CONT';
export const SUPPLY_UNIT_ID = 'UNIT-SUP';

export const WORKFLOW_STEP_ORDERS: Record<UnitResponsibleType, number[]> = {
  [UnitResponsibleType.LT100K]: [1, 2, 3, 4],
  [UnitResponsibleType.LT500K]: [1, 2, 3, 4],
  [UnitResponsibleType.MT500K]: [1, 2, 3, 4, 5, 6],
  [UnitResponsibleType.SELECTION]: [1, 2, 3, 4, 5, 6, 7],
  [UnitResponsibleType.EBIDDING]: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  [UnitResponsibleType.CONTRACT]: [1, 2, 3, 4, 5, 6, 7],
  [UnitResponsibleType.INTERNAL]: [1, 2, 3, 4],
};

export const WORKLOAD_STATUSES = [
  ProjectStatus.WAITING_ACCEPT,
  ProjectStatus.IN_PROGRESS,
  ProjectStatus.WAITING_CANCEL,
  ProjectStatus.REQUEST_EDIT,
];
