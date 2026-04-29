import { UserRole } from '@prisma/client';
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
  roles: AuthRoleDetail[];
}

export interface LoginResponse {
  token: string;
  id: string;
  roles: AuthRoleDetail[];
  is_delegated: boolean;
  delegated_by: DelegatedByUser[];
}

export interface RegisterResponse {
  id: string;
  username: string;
  email: string | null;
  full_name: string;
  roles: Array<{
    role: UserRole;
    dept_id: string;
    unit_id: string | null;
    department: {
      id: string;
      name: string;
    };
    unit: {
      id: string;
      name: string;
    } | null;
  }>;
  created_at: Date;
}

export interface FetchAndFormatUserDetailsResponse {
  user: {
    id: string;
    username: string;
    full_name: string;
    email: string | null;
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
  email?: string;
  roles: AuthRoleDetail[];
  is_delegated: boolean;
  delegated_by: DelegatedByUser[];
}

export type AuthenticatedRequest = Request & {
  user?: AuthPayload;
};
