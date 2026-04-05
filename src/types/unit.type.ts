import { Unit } from '@prisma/client';
import { PaginatedResponse } from './common.type';

export type PaginatedUnits = PaginatedResponse<Unit>;

export type UpdateUnitUsersResponse = {
  count: number;
  message: string;
};
