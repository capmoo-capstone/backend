import {
  ProcurementType,
  Project,
  ProjectPhaseStatus,
  ProjectStatus,
  UnitResponsibleType,
  UrgentType,
  UserRole,
} from '@prisma/client';
import { ListResponse, PaginatedResponse } from './common.type';
import { Decimal } from '@prisma/client/runtime/client';

export interface PhaseStatusResult {
  status: ProjectPhaseStatus;
  step?: number | null;
}

export type PaginatedProjects = PaginatedResponse<Project>;

export type ProjectsListResponse = ListResponse<Project>;

export type CreateProjectResponse = Project;

export type UpdateProjectDataResponse = Project;

export interface ProjectIdStatusResponse {
  id: string;
  status: ProjectStatus;
}

export type ProjectAssigneeResponse = ProjectIdStatusResponse &
  Record<string, unknown>;

export type ProjectAssigneeListResponse = ProjectAssigneeResponse[];

export interface ProjectCancellationResponse {
  project_id: string;
  reason: string;
  is_cancelled: boolean;
}

export interface CompleteProcurementPhaseResponse extends ProjectIdStatusResponse {
  current_workflow_type: UnitResponsibleType;
  responsible_unit_id: string;
}

export interface CompleteContractPhaseResponse extends ProjectIdStatusResponse {
  contract_status: ProjectPhaseStatus;
}

export interface RequestEditProjectResponse extends ProjectIdStatusResponse {
  request_edit_reason: string | null;
}

export interface ProjectDetailsResponse {
  id: string;
  procurement_type: ProcurementType;
  current_workflow_type: UnitResponsibleType;
  responsible_unit_id: string;
  is_urgent: UrgentType;
  title: string;
  description: string | null;
  budget: Decimal;
  status: ProjectStatus;
  procurement_status: PhaseStatusResult;
  contract_status: PhaseStatusResult;
  budget_plans: Array<{
    id: string;
    activity_type_name: string;
    budget_amount: Decimal;
  }>;
  receive_no: string;
  less_no: string | null;
  pr_no: string | null;
  po_no: string | null;
  contract_no: string | null;
  migo_no: string | null;
  asset_code: boolean | null;
  expected_approval_date: Date | null;
  expected_completion_procurement_date: Date | null;
  request_edit_reason: string | null;
  created_at: Date;
  updated_at: Date | null;
  vendor: {
    name: string | null;
    email: string | null;
  };
  requester: {
    dept_id: string;
    dept_name: string;
    unit_id: string | null;
    unit_name: string | null;
  };
  creator: {
    id: string;
    full_name: string;
  };
  assignee_procurement: Array<{
    id: string;
    full_name: string;
  }> | null;
  assignee_contract: Array<{
    id: string;
    full_name: string;
  }> | null;
  cancellation: Array<{
    reason: string;
    is_cancelled: boolean;
    requester: {
      id: string;
      full_name: string;
    };
    approver: {
      id: string;
      full_name: string;
    } | null;
    requested_at: Date;
    approved_at: Date | null;
  }> | null;
}

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
}

export type SummaryResponse =
  | (SummaryResponseBase & {
      role: 'SUPPLY';
      [ProjectStatus.UNASSIGNED]: number;
      [ProjectStatus.WAITING_ACCEPT]: number;
    })
  | (SummaryResponseBase & { role: 'EXTERNAL'; NOT_STARTED: number });
