import { UserRole } from '@prisma/client';

export interface UsersListFilters {
  unitId?: string;
  deptId?: string;
}

export interface UserListItem {
  id: string;
  full_name: string;
  roles: UserRole[];
}

export interface UsersListResponse {
  id: string;
  entity_type: string;
  name: string;
  total: number;
  data: UserListItem[];
}
