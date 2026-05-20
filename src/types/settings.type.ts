import { UnitResponsibleType } from '@prisma/client';

export interface SettingsUser {
  id: string;
  full_name: string;
}

export interface SettingsDelegation {
  id: string;
  delegatee: SettingsUser;
  start_date: Date;
  end_date: Date | null;
}

export interface OpsUnitSettingsUnit {
  id: string;
  dept_id: string;
  name: string;
  type: UnitResponsibleType[];
  head: (SettingsUser & {
    active_delegation: SettingsDelegation | null;
  }) | null;
  users: SettingsUser[];
}

export interface OpsUnitSettingsResponse {
  units: OpsUnitSettingsUnit[];
}

export interface RepresentativeSettingsUnit {
  id: string;
  name: string;
  representative: SettingsUser | null;
}

export interface RepresentativeSettingsDepartment {
  id: string;
  name: string;
  units: RepresentativeSettingsUnit[];
}

export interface RepresentativeSettingsResponse {
  departments: RepresentativeSettingsDepartment[];
}

export type OpsStaffSettingsRole =
  | 'HEAD_OF_DEPARTMENT'
  | 'DOCUMENT_STAFF'
  | 'FINANCE_STAFF'
  | 'ADMIN';

export interface HeadOfDepartmentRole {
  role: 'HEAD_OF_DEPARTMENT';
  user: SettingsUser;
  active_delegation: SettingsDelegation | null;
}

export interface OtherOpsStaffRole {
  role: Exclude<OpsStaffSettingsRole, 'HEAD_OF_DEPARTMENT'>;
  users: SettingsUser[];
}

export type OpsStaffRoleItem = HeadOfDepartmentRole | OtherOpsStaffRole;

export interface OpsStaffSettingsResponse {
  department: {
    id: string;
    name: string;
  };
  roles: OpsStaffRoleItem[];
}
