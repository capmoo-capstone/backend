import { Project, ProjectPhaseStatus } from '@prisma/client';
import { ListResponse, PaginatedResponse } from './common.type';

export interface PhaseStatusResult {
  status: ProjectPhaseStatus;
  step?: number;
}

export type PaginatedProjects = PaginatedResponse<Project>;

export type ProjectsListResponse = ListResponse<Project>;
