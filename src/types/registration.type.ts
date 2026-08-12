import { RegistrationRequest } from '@prisma/client';
import { PaginatedResponse } from './common.type';

export type RegistrationRequestItem = RegistrationRequest & {
  department: { id: string; name: string };
  units: Array<{ id: string; name: string }>;
};

export type PaginatedRegistrationRequest =
  PaginatedResponse<RegistrationRequestItem>;
