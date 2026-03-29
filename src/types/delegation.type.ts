import { UserDelegation } from '@prisma/client';

export interface DelegationDetail extends UserDelegation {
  delegator: {
    id: string;
    full_name: string;
    roles: {
      role: string;
      dept_id: string;
      unit_id: string | null;
    }[];
  };
  delegatee: {
    id: string;
    full_name: string;
    roles: {
      role: string;
      dept_id: string;
      unit_id: string | null;
    }[];
  };
}
