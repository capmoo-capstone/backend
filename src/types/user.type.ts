import { User } from '@prisma/client';
import { ListResponse } from './common.type';

export interface UsersListFilters {
  unitId?: string;
  deptId?: string;
}

export interface UsersListResponse extends ListResponse<User> {
  id: string;
  entity_type: string;
  name: string;
}
