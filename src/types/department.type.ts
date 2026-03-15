import { Department } from '@prisma/client';
import { ListResponse } from './common.type';

export type DepartmentsListResponse = ListResponse<Department>;
