import { UrgentType, UnitResponsibleType } from '@prisma/client';

export interface TimelineResult {
  unitResponsibilityType: UnitResponsibleType;
  isCustomDate: boolean;
  deliveryDate: string;
  remainingWorkingDays: number;
  urgentLevel: UrgentType;
  urgencyWarningThreshold: number;
}
