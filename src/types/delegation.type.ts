import { UserDelegation, UserRole } from '@prisma/client';

export interface DelegationDetail extends UserDelegation {
  delegator: {
    id: string;
    full_name: string;
    roles: {
      role: UserRole;
      dept_id: string;
      unit_id: string | null;
    }[];
  };
  delegatee: {
    id: string;
    full_name: string;
    roles: {
      role: UserRole;
      dept_id: string;
      unit_id: string | null;
    }[];
  };
}
