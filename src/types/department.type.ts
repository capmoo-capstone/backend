import { Department, Unit } from '@prisma/client';
import { ListResponse } from './common.type';

export interface DepartmentListUnit extends Unit {
  rep: {
    id: string;
    full_name: string;
  } | null;
}

export interface DepartmentListItem extends Department {
  units?: DepartmentListUnit[];
}

export type DepartmentsListResponse = ListResponse<DepartmentListItem>;
