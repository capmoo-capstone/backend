import { User, UserRole } from '@prisma/client';

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

export interface UserDetailResponse extends User {
  roles: {
    role: UserRole;
    department: {
      id: string;
      name: string;
    };
    unit: {
      id: string;
      name: string;
    } | null;
  }[];
}

export interface UpdateUserRoleResponse {
  id: string;
  role: UserRole;
  dept_id: string;
  unit_id: string | null;
}
