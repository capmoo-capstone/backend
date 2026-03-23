import { Project, ProjectPhaseStatus, UserRole } from '@prisma/client';
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

interface SupplySummary {
  role: 'SUPPLY';
  total: number;
  unassigned: number;
  waiting_accept: number;
  in_progress: number;
  closed: number;
  cancelled: number;
  urgent: number;
  very_urgent: number;
}

interface ExternalSummary {
  role: 'EXTERNAL';
  total: number;
  not_started: number;
  in_progress: number;
  closed: number;
  cancelled: number;
  urgent: number;
  very_urgent: number;
}

export type SummaryResponse = SupplySummary | ExternalSummary;
