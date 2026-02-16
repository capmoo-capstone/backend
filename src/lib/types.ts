import { Role } from '@prisma/client';

export interface UserPayload {
  id: string;
  is_delegated: boolean;
  roles: {
    own: Array<{
      role: Role;
      dept_id: string;
      dept_code: string;
      dept_name: string;
      unit_id: string | null;
      unit_name: string | null;
    }>;
    delegated: Array<{
      role: Role;
      dept_id: string;
      dept_code: string;
      dept_name: string;
      unit_id: string | null;
      unit_name: string | null;
    }>;
  };
}
