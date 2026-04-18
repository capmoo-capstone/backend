import {
  ProjectDocument,
  SubmissionStatus,
  SubmissionType,
  UnitResponsibleType,
} from '@prisma/client';

export interface SubmissionActionResponse {
  id: string;
  project_id: string;
  workflow_type: UnitResponsibleType;
  step_order: number;
  submission_round: number;
  status: SubmissionStatus;
}

export interface RejectedSubmissionResponse extends SubmissionActionResponse {
  comment: string | null;
  approved_at: Date | null;
  approved_by: string | null;
}

export interface ApprovedSubmissionResponse extends SubmissionActionResponse {
  approved_at: Date | null;
  approved_by: string | null;
  completed_at: Date | null;
  completed_by: string | null;
}

export interface ProposedSubmissionResponse extends SubmissionActionResponse {
  proposing_at: Date | null;
  proposing_by: string | null;
}

export interface CompletedSubmissionResponse extends SubmissionActionResponse {
  completed_at: Date | null;
  completed_by: string | null;
}

export interface SubmissionDetailResponse {
  id: string;
  project_id: string;
  workflow_type: UnitResponsibleType;
  step_order: number;
  submission_round: number;
  submission_type: SubmissionType;
  status: SubmissionStatus;
  meta_data: unknown;
  comment: string | null;
  submitted_at: Date;
  approved_at: Date | null;
  proposing_at: Date | null;
  completed_at: Date | null;
  submitted_by: string | null;
  approved_by: string | null;
  proposing_by: string | null;
  completed_by: string | null;
  documents: ProjectDocument[];
}

export interface ProjectSubmissionsResponse {
  procurement: SubmissionDetailResponse[];
  contract: SubmissionDetailResponse[];
}
