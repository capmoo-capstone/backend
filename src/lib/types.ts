import { Role } from '@prisma/client';

export interface UserPayload {
  id: string;
  username: string;
  email: string | null;
  dept_id: string;
  unit_id: string | null;
  is_delegated: boolean;
  delegated_by: string | null;
  roles: {
    own: Array<{
      role: Role;
      dept_code: string;
      unit_name: string | null;
    }>;
    delegated: Array<{
      role: Role;
      dept_code: string;
      unit_name: string | null;
    }>;
  };
}
