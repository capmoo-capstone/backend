import { UserRole, RegisterType } from '@prisma/client';

export interface UserDetailResponse {
  id: string;
  username: string;
  email: string | null;
  full_name: string;
  register_type: RegisterType;
  created_at: Date;
  role_updated_at: Date;
  last_login_at: Date | null;
  roles: {
    id: string;
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
