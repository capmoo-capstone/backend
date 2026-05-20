import { Unit, UserRole } from '@prisma/client';
import { PaginatedResponse } from './common.type';

export interface UnitListOptions {
  deptId?: string;
  withUsers?: boolean;
  withHead?: boolean;
  withDelegations?: boolean;
}

export interface UnitListUser {
  id: string;
  full_name: string;
  role: UserRole;
}

export interface UnitListDelegation {
  id: string;
  delegator: {
    id: string;
    full_name: string;
  };
  delegatee: {
    id: string;
    full_name: string;
  };
  start_date: Date;
  end_date: Date | null;
}

export interface UnitListItem extends Unit {
  users?: UnitListUser[];
  head?: {
    id: string;
    full_name: string;
  } | null;
  delegations?: UnitListDelegation[];
}

export type PaginatedUnits = PaginatedResponse<UnitListItem>;

export interface UnitRepresentativeResponse {
  id: string;
  unit_id: string;
  full_name: string;
}
