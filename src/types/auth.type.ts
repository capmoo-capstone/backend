import { UserRole, RegisterType } from '@prisma/client';
import { Request } from 'express';

export interface AuthRoleDetail {
  role: UserRole;
  dept_id: string;
  dept_name: string;
  unit_id: string | null;
  unit_name: string | null;
}

export interface DelegatedByUser {
  id: string;
  full_name: string;
  role: UserRole | null;
  dept_id: string | null;
  unit_id: string | null;
  start_date: Date;
  end_date: Date | null;
}

export interface FetchAndFormatUserDetailsResponse {
  user: {
    id: string;
    username: string;
    full_name: string;
    email: string | null;
    register_type: RegisterType;
  };
  authData: {
    roles: AuthRoleDetail[];
    is_delegated: boolean;
    delegated_by: DelegatedByUser[];
  };
}

export interface AuthPayload {
  token: string;
  id: string;
  username: string;
  full_name: string;
  email?: string | null;
  user_type?: RegisterType;
  roles: AuthRoleDetail[];
  is_delegated: boolean;
  delegated_by: DelegatedByUser[];
}

export type AuthenticatedRequest = Request & {
  user?: AuthPayload;
};
