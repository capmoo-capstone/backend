import { Role } from '@prisma/client';

export interface AuthPayload {
  token: string;
  id: string;
  username: string;
  full_name: string;
  roles: Array<{
    role: Role;
    dept_id: string;
    dept_code: string;
    dept_name: string;
    unit_id: string | null;
    unit_name: string | null;
  }>;
  is_delegated: boolean;
  delegated_by: Array<{
    id: string;
    full_name: string;
    roles: Role[];
  }>;
};
