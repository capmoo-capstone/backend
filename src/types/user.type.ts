import { UserRole, RegisterType } from '@prisma/client';

export interface UserListFilters {
  unitId?: string;
  deptId?: string;
  role?: UserRole;
}

export interface UserListItem {
  id: string;
  full_name: string;
  register_type: RegisterType;
  roles: UserRole[];
}

export interface UserListResponse {
  id: string;
  entity_type: string;
  name: string;
  total: number;
  data: UserListItem[];
}

export interface UserDetailResponse {
  id: string;
  username: string;
  email: string | null;
  full_name: string;
  register_type: RegisterType;
  created_at: Date;
  role_updated_at: Date;
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
