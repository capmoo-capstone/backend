import {
  ProcurementType,
  Project,
  ProjectPhaseStatus,
  ProjectStatus,
  UrgentType,
  UserRole,
} from '@prisma/client';
import { ListResponse, PaginatedResponse } from './common.type';

export interface PhaseStatusResult {
  status: ProjectPhaseStatus;
  step?: number;
}

export type PaginatedProjects = PaginatedResponse<Project>;

export type ProjectsListResponse = ListResponse<Project>;

export interface StaffWorkload {
  user_id: string;
  full_name: string;
  workload: number;
}

export interface UnitWorkload {
  unit_id: string;
  unit_name: string;
  staff: StaffWorkload[];
}

export interface WorkloadStatsResponse {
  role: UserRole;
  // HEAD_OF_DEPARTMENT
  units?: UnitWorkload[];
  // HEAD_OF_UNIT
  unit_id?: string;
  unit_name?: string;
  staff?: StaffWorkload[];
}

interface SummaryResponseBase {
  total: number;
  [ProjectStatus.IN_PROGRESS]: number;
  [ProjectStatus.CLOSED]: number;
  [ProjectStatus.CANCELLED]: number;
  [UrgentType.URGENT]: number;
  [UrgentType.VERY_URGENT]: number;
  [UrgentType.SUPER_URGENT]: number;
}

export type SummaryResponse =
  | (SummaryResponseBase & {
      role: 'SUPPLY';
      [ProjectStatus.UNASSIGNED]: number;
      [ProjectStatus.WAITING_ACCEPT]: number;
    })
  | (SummaryResponseBase & { role: 'EXTERNAL'; NOT_STARTED: number });
