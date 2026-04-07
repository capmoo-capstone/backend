import { Unit } from '@prisma/client';
import { PaginatedResponse } from './common.type';

export type PaginatedUnits = PaginatedResponse<Unit>;

export type UpdateUnitUsersResponse = {
  count: number;
  message: string;
};

export interface UnitRepresentativeResponse {
  id: string;
  unit_id: string;
  full_name: string;
}
