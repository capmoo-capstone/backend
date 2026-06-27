import { UserDelegation } from '@prisma/client';

export interface DelegationDetail extends UserDelegation {
  delegator: {
    id: string;
    full_name: string;
  };
  delegatee: {
    id: string;
    full_name: string;
  };
}
